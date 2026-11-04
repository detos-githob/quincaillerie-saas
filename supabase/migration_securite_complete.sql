-- =====================================================================
-- MIGRATION : CORRECTIFS DE SÉCURITÉ COMPLETS (audit du 04/11/2026)
-- À exécuter APRÈS migration_securite_critique.sql. Idempotente : peut
-- être relancée sans risque.
--
-- C4  écriture directe dans les tables de gestion : verrouillée
-- C5  prix, remises et quantités contrôlés par le serveur
-- C6  compte désactivé / abonnement expiré : refusés par la base
-- M1  numéros de pièces : verrou par entreprise, plus de suppression
-- M3  une seule période d'essai par numéro de téléphone
-- M4  super admin : double authentification obligatoire (aal2)
-- F3  limite de comptes d'équipe vérifiée de façon atomique
-- + gestion des membres (désactiver / réactiver) réservée au gérant
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. SUPER ADMIN : DOUBLE AUTHENTIFICATION OBLIGATOIRE (M4)
-- ---------------------------------------------------------------------
-- Le jeton d'une session validée par un code (application Authenticator)
-- porte aal = 'aal2'. Sans ce code, le compte super admin n'a AUCUN droit
-- d'administration, même avec le bon mot de passe.
create or replace function est_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from super_admins where auth_user_id = auth.uid())
       and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- Indique à l'interface qu'un super admin doit encore saisir son code.
create or replace function super_admin_mfa_requise()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from super_admins where auth_user_id = auth.uid())
       and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2';
$$;
revoke all on function super_admin_mfa_requise() from public, anon;
grant execute on function super_admin_mfa_requise() to authenticated;
grant execute on function est_super_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. UTILISATEUR COURANT, COMPTE DÉSACTIVÉ (C6)
-- ---------------------------------------------------------------------
-- Toutes les règles d'accès reposent sur cette fonction : un compte
-- désactivé n'a plus accès à aucune donnée de l'entreprise.
create or replace function entreprise_de_l_utilisateur_connecte()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select entreprise_id from utilisateurs where auth_user_id = auth.uid() and actif;
$$;
grant execute on function entreprise_de_l_utilisateur_connecte() to anon, authenticated;

-- La fiche de l'utilisateur reste lisible par lui-même (l'appli peut
-- ainsi afficher « compte désactivé » au lieu d'une erreur).
drop policy if exists voir_sa_propre_fiche on utilisateurs;
create policy voir_sa_propre_fiche on utilisateurs
    for select using (auth_user_id = auth.uid());

-- Les vérifications des fonctions métier refusent aussi un compte désactivé
-- (déjà le cas de verifier_acces_entreprise ; rien à changer).

-- ---------------------------------------------------------------------
-- 2. NIVEAU D'ACCÈS PAR MODULE (même matrice que src/lib/permissions.ts)
-- ---------------------------------------------------------------------
create or replace function niveau_acces_module(p_module text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_id     uuid;
    v_role   text;
    v_actif  boolean;
    v_niveau text;
begin
    select id, role, actif into v_id, v_role, v_actif from utilisateurs where auth_user_id = auth.uid();
    if v_role is null or v_actif is not true then return 'aucun'; end if;
    if v_role = 'gerant' then return 'ecriture'; end if;
    select niveau into v_niveau from permissions_utilisateur where utilisateur_id = v_id and module = p_module;
    if v_niveau is not null then return v_niveau; end if;
    return case
        when v_role = 'comptable' and p_module in ('dashboard','clients','tontines','factures','depenses','support') then 'ecriture'
        when v_role = 'comptable' and p_module in ('stock','inventaire','clotures','abonnement') then 'lecture'
        when v_role = 'magasinier' and p_module in ('stock','inventaire','fournisseurs','livraisons','depot_boissons','support') then 'ecriture'
        when v_role = 'vendeur' and p_module in ('vente','clients','tontines','factures','support') then 'ecriture'
        else 'aucun'
    end;
end;
$$;
revoke all on function niveau_acces_module(text) from public, anon;
grant execute on function niveau_acces_module(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. CONTRÔLE CENTRAL DES ÉCRITURES (C4 + C6)
-- ---------------------------------------------------------------------
-- Déclenché sur chaque table de gestion, qu'on écrive directement par
-- l'API ou au travers d'une fonction. Refuse :
--   - un compte désactivé, une écriture pour une autre entreprise ;
--   - une entreprise suspendue ou dont l'abonnement a expiré depuis plus
--     de 7 jours (délai laissé aux ventes faites hors ligne pour arriver) ;
--   - un module auquel l'utilisateur n'a pas droit en écriture.
-- Les traitements serveur (clé service_role, tâches planifiées) et le
-- super admin vérifié ne sont pas concernés.
create or replace function contexte_ecriture()
returns table (utilisateur_id uuid, entreprise_id uuid, actif boolean, entreprise_active boolean, date_expiration date)
language sql
stable
security definer
set search_path = public
as $$
    select u.id, u.entreprise_id, u.actif, e.actif, e.date_expiration_abonnement
    from utilisateurs u join entreprises e on e.id = u.entreprise_id
    where u.auth_user_id = auth.uid();
$$;
revoke all on function contexte_ecriture() from public, anon;
grant execute on function contexte_ecriture() to authenticated;

create or replace function controler_ecriture()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_ligne    jsonb := to_jsonb(coalesce(new, old));
    v_ctx      record;
    v_module   text := coalesce(tg_argv[0], '');
    v_mode     text := coalesce(tg_argv[1], 'direct');
    v_direct   boolean := current_user in ('authenticated', 'anon');
    v_modules  text[];
    v_ok       boolean;
begin
    if auth.uid() is null then
        return coalesce(new, old);
    end if;
    if est_super_admin() then
        return coalesce(new, old);
    end if;

    select * into v_ctx from contexte_ecriture();
    if v_ctx.utilisateur_id is null or v_ctx.actif is not true then
        raise exception 'Compte désactivé : action refusée.' using errcode = '42501';
    end if;
    if (v_ligne ->> 'entreprise_id') is not null and (v_ligne ->> 'entreprise_id')::uuid is distinct from v_ctx.entreprise_id then
        raise exception 'Accès refusé.' using errcode = '42501';
    end if;
    if v_ctx.entreprise_active is not true
       or (v_ctx.date_expiration is not null and v_ctx.date_expiration < current_date - 7) then
        raise exception 'Abonnement expiré ou compte suspendu : renouvelle ton abonnement pour continuer.' using errcode = '42501';
    end if;

    -- Mouvements de stock : le module dépend du type de mouvement.
    if v_module = 'mouvement' then
        v_module := case v_ligne ->> 'type_mouvement'
            when 'entree' then 'stock|fournisseurs'
            when 'correction_manuelle' then 'stock'
            when 'ajustement_inventaire' then 'inventaire'
            when 'casse' then 'stock|depot_boissons'
            else ''
        end;
        v_mode := 'toujours';
    end if;

    if v_module <> '' and (v_mode = 'toujours' or v_direct) then
        v_modules := string_to_array(v_module, '|');
        select bool_or(niveau_acces_module(m) = 'ecriture') into v_ok from unnest(v_modules) m;
        if v_ok is not true then
            raise exception 'Action non autorisée pour ton rôle.' using errcode = '42501';
        end if;
    end if;
    return coalesce(new, old);
end;
$$;

do $$
declare
    v record;
begin
    for v in select * from (values
        -- table,              module,                    mode
        ('ventes',              'vente|tontines',          'toujours'),
        ('factures',            '',                        'direct'),
        ('avoirs',              'factures',                'toujours'),
        ('mouvements_stock',    'mouvement',               'toujours'),
        ('mouvements_creance',  '',                        'direct'),
        ('paiements',           'clients|vente|factures',  'toujours'),
        ('paiements_personnel', 'depenses',                'toujours'),
        ('depenses',            'depenses',                'toujours'),
        ('employes',            'depenses',                'direct'),
        ('cotisations_tontine', 'tontines',                'toujours'),
        ('tontines',            'tontines',                'direct'),
        ('panier_tontine',      'tontines',                'direct'),
        ('articles',            'stock',                   'direct'),
        ('categories',          'stock',                   'direct'),
        ('clients',             'clients|vente',           'direct'),
        ('fournisseurs',        'fournisseurs',            'direct'),
        ('commandes_fournisseur','fournisseurs',           'direct'),
        ('livraisons',          'livraisons',              'direct'),
        ('inventaires',         'inventaire',              'toujours'),
        ('lignes_inventaire',   'inventaire',              'direct'),
        ('casses',              'stock|depot_boissons',    'toujours'),
        ('mouvements_consigne', 'depot_boissons|vente',    'toujours'),
        ('depots',              'depot_boissons',          'direct'),
        ('clotures',            '',                        'direct'),
        ('conditions_tontine',  '',                        'direct')
    ) as t(nom, module, mode)
    loop
        if to_regclass('public.' || v.nom) is null then
            raise notice 'Table absente, ignorée : %', v.nom;
            continue;
        end if;
        execute format('drop trigger if exists trg_controler_ecriture on public.%I', v.nom);
        execute format(
            'create trigger trg_controler_ecriture before insert or update or delete on public.%I
             for each row execute function controler_ecriture(%L, %L)', v.nom, v.module, v.mode);
    end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. ÉCRITURES DIRECTES PAR L'API (C4)
-- ---------------------------------------------------------------------
-- Personne n'écrit plus directement dans les pièces comptables : tout
-- passe par les fonctions sécurisées (vente, avoir, cotisation, paiement,
-- clôture…). Une vente ne se supprime plus : elle s'annule par un avoir.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;

revoke insert, update, delete on
    ventes, lignes_vente, factures, avoirs, lignes_avoir,
    mouvements_stock, mouvements_creance, paiements, paiements_personnel,
    cotisations_tontine, mouvements_consigne, casses, inventaires,
    lignes_commande_fournisseur, alertes, journal_audit, clotures,
    conditions_tontine, permissions_utilisateur, categories, depots
from authenticated;

-- Tables encore écrites directement par l'appli : uniquement ce dont elle a besoin.
revoke delete on articles, clients, fournisseurs, employes, livraisons, tontines, commandes_fournisseur from authenticated;
revoke insert on commandes_fournisseur, lignes_inventaire from authenticated;
revoke delete on lignes_inventaire from authenticated;

-- Colonnes calculées par le serveur : jamais modifiables directement.
-- (Une écriture faite par une fonction sécurisée n'est pas concernée :
-- elle s'exécute sous le rôle propriétaire, pas « authenticated ».)
create or replace function seules_colonnes_modifiees(p_avant jsonb, p_apres jsonb, p_permises text[])
returns boolean
language sql
immutable
as $$
    select (p_avant - p_permises) = (p_apres - p_permises);
$$;

create or replace function proteger_colonnes_calculees()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if current_user not in ('authenticated', 'anon') then
        return new;
    end if;

    if tg_table_name = 'articles' then
        new.stock_actuel := case when tg_op = 'INSERT' then 0 else old.stock_actuel end;

    elsif tg_table_name = 'clients' then
        if tg_op = 'INSERT' then
            new.solde_credit := 0;
            new.solde_consigne_casiers := 0;
            new.solde_consigne_bouteilles := 0;
        else
            new.solde_credit := old.solde_credit;
            new.solde_consigne_casiers := old.solde_consigne_casiers;
            new.solde_consigne_bouteilles := old.solde_consigne_bouteilles;
        end if;

    elsif tg_table_name = 'tontines' then
        if tg_op = 'INSERT' then
            new.montant_cumule := 0;
            new.statut := 'en_cours';
            new.date_atteinte := null;
        else
            new.montant_cumule := old.montant_cumule;
            new.statut := old.statut;
            new.date_atteinte := old.date_atteinte;
        end if;

    elsif tg_table_name = 'commandes_fournisseur' then
        -- Seule action directe permise : annuler une commande pas encore reçue.
        if not seules_colonnes_modifiees(to_jsonb(old), to_jsonb(new), array['statut'])
           or new.statut <> 'annulee'
           or old.statut in ('recue', 'annulee') then
            raise exception 'Seule l''annulation d''une commande non reçue est possible.' using errcode = '42501';
        end if;

    elsif tg_table_name = 'lignes_inventaire' then
        -- Seule action directe permise : saisir la quantité comptée d'un inventaire en cours.
        if not seules_colonnes_modifiees(to_jsonb(old), to_jsonb(new), array['quantite_comptee', 'ecart'])
           or not exists (select 1 from inventaires i where i.id = new.inventaire_id and i.statut = 'en_cours') then
            raise exception 'Seule la quantité comptée d''un inventaire en cours peut être saisie.' using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;

do $$
declare
    v_table text;
begin
    foreach v_table in array array['articles', 'clients', 'tontines', 'commandes_fournisseur', 'lignes_inventaire'] loop
        execute format('drop trigger if exists trg_proteger_colonnes on public.%I', v_table);
        execute format(
            'create trigger trg_proteger_colonnes before insert or update on public.%I
             for each row execute function proteger_colonnes_calculees()', v_table);
    end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. PRIX, REMISES ET QUANTITÉS CONTRÔLÉS PAR LE SERVEUR (C5)
-- ---------------------------------------------------------------------
-- NOT VALID : la règle s'applique aux nouvelles lignes sans bloquer
-- d'éventuelles anciennes lignes déjà en base.
alter table lignes_vente drop constraint if exists lignes_vente_valeurs_valides;
alter table lignes_vente add constraint lignes_vente_valeurs_valides
    check (quantite > 0 and prix_unitaire >= 0 and coalesce(remise, 0) >= 0
           and coalesce(remise, 0) <= quantite * prix_unitaire) not valid;

alter table paiements drop constraint if exists paiements_montant_positif;
alter table paiements add constraint paiements_montant_positif check (montant > 0) not valid;

alter table casses drop constraint if exists casses_quantites_valides;
do $$
begin
    -- Colonnes de quantité de la table casses (selon la version installée).
    if exists (select 1 from information_schema.columns where table_name = 'casses' and column_name = 'quantite_casiers') then
        execute 'alter table casses add constraint casses_quantites_valides
                 check (coalesce(quantite_casiers, 0) >= 0 and coalesce(quantite_bouteilles, 0) >= 0) not valid';
    end if;
end $$;

create or replace function controler_ligne_vente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_article  articles%rowtype;
    v_role     text;
    v_plancher numeric;
begin
    select * into v_article from articles where id = new.article_id;
    if not found then
        raise exception 'Article introuvable.' using errcode = '42501';
    end if;
    -- Le prix d'achat (et donc la marge) vient toujours de la fiche article.
    new.prix_achat_unitaire := v_article.prix_achat;

    if new.quantite is null or new.quantite <= 0 then
        raise exception 'Quantité invalide pour « % ».', v_article.designation using errcode = '22023';
    end if;

    -- Prix sous le tarif ou remise : réservé au gérant.
    if auth.uid() is not null then
        select role into v_role from utilisateurs where auth_user_id = auth.uid();
        if v_role is distinct from 'gerant' then
            v_plancher := least(
                v_article.prix_vente,
                coalesce(v_article.prix_demi_gros, v_article.prix_vente),
                coalesce(v_article.prix_gros, v_article.prix_vente)
            );
            if new.prix_unitaire < v_plancher or coalesce(new.remise, 0) > 0 then
                raise exception 'Prix ou remise non autorisé pour « % » : seul le gérant peut vendre sous le tarif.',
                    v_article.designation using errcode = '42501';
            end if;
        end if;
    end if;
    return new;
end;
$$;
drop trigger if exists trg_controler_ligne_vente on lignes_vente;
create trigger trg_controler_ligne_vente before insert on lignes_vente
    for each row execute function controler_ligne_vente();

-- ---------------------------------------------------------------------
-- 6. NUMÉROS DE PIÈCES (M1)
-- ---------------------------------------------------------------------
-- Les numéros sont « nombre de pièces du jour + 1 ». Ils restent uniques
-- tant que (a) deux créations simultanées s'attendent et (b) aucune pièce
-- n'est supprimée. (b) est garanti par la section 4 ; (a) par un verrou
-- par entreprise, ajouté ici aux trois fonctions qui n'en avaient pas.
create or replace function creer_avoir_vente(
    p_vente_id uuid, p_entreprise_id uuid, p_motif text, p_lignes jsonb, p_utilisateur_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u uuid := verifier_acces_entreprise(p_entreprise_id);
begin
    perform verifier_reference('ventes', p_vente_id, p_entreprise_id);
    if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or exists (
        select 1 from jsonb_array_elements(p_lignes) l
        where l->>'ligne_vente_id' is null
           or not exists (select 1 from lignes_vente lv
                          where lv.id = (l->>'ligne_vente_id')::uuid and lv.vente_id = p_vente_id)
    ) then
        raise exception 'Accès refusé : ligne de vente introuvable.' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtext('vente_' || p_entreprise_id::text));
    return _interne_creer_avoir_vente(p_vente_id, p_entreprise_id, p_motif, p_lignes, coalesce(v_u, p_utilisateur_id));
end;
$$;

create or replace function creer_commande_fournisseur(
    p_entreprise_id uuid, p_fournisseur_id uuid, p_utilisateur_id uuid, p_date_reception_prevue date, p_lignes jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u uuid := verifier_acces_entreprise(p_entreprise_id);
begin
    perform verifier_reference('fournisseurs', p_fournisseur_id, p_entreprise_id);
    perform verifier_articles_lignes(p_lignes, p_entreprise_id);
    if niveau_acces_module('fournisseurs') <> 'ecriture' then
        raise exception 'Action non autorisée pour ton rôle.' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtext('commande_' || p_entreprise_id::text));
    return _interne_creer_commande_fournisseur(p_entreprise_id, p_fournisseur_id, coalesce(v_u, p_utilisateur_id),
                                               p_date_reception_prevue, p_lignes);
end;
$$;

create or replace function enregistrer_paiement_personnel(
    p_entreprise_id uuid, p_employe_id uuid, p_montant numeric, p_periode text, p_motif text,
    p_mode_paiement text, p_utilisateur_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u uuid := verifier_acces_entreprise(p_entreprise_id);
begin
    perform verifier_reference('employes', p_employe_id, p_entreprise_id);
    perform pg_advisory_xact_lock(hashtext('paiement_personnel_' || p_entreprise_id::text));
    return _interne_enregistrer_paiement_personnel(p_entreprise_id, p_employe_id, p_montant, p_periode, p_motif,
                                                   p_mode_paiement, coalesce(v_u, p_utilisateur_id));
end;
$$;

revoke all on function creer_avoir_vente(uuid, uuid, text, jsonb, uuid) from public, anon;
revoke all on function creer_commande_fournisseur(uuid, uuid, uuid, date, jsonb) from public, anon;
revoke all on function enregistrer_paiement_personnel(uuid, uuid, numeric, text, text, text, uuid) from public, anon;
grant execute on function creer_avoir_vente(uuid, uuid, text, jsonb, uuid) to authenticated;
grant execute on function creer_commande_fournisseur(uuid, uuid, uuid, date, jsonb) to authenticated;
grant execute on function enregistrer_paiement_personnel(uuid, uuid, numeric, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. ÉQUIPE : DÉSACTIVER / RÉACTIVER UN MEMBRE, LIMITE ATOMIQUE (C3, F3)
-- ---------------------------------------------------------------------
create or replace function modifier_membre_equipe(p_utilisateur_id uuid, p_actif boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_moi    utilisateurs%rowtype;
    v_membre utilisateurs%rowtype;
    v_limite integer;
begin
    select * into v_moi from utilisateurs where auth_user_id = auth.uid() and actif;
    if v_moi.role is distinct from 'gerant' then
        raise exception 'Seul le gérant gère l''équipe.' using errcode = '42501';
    end if;
    select * into v_membre from utilisateurs where id = p_utilisateur_id;
    if v_membre.id is null or v_membre.entreprise_id <> v_moi.entreprise_id then
        raise exception 'Membre introuvable.' using errcode = '42501';
    end if;
    if v_membre.role = 'gerant' then
        raise exception 'Le compte du gérant ne peut pas être désactivé.' using errcode = '42501';
    end if;

    perform pg_advisory_xact_lock(hashtext('equipe_' || v_moi.entreprise_id::text));
    if p_actif and not v_membre.actif then
        v_limite := coalesce(limite_utilisateurs_entreprise(v_moi.entreprise_id), 2);
        if (select count(*) from utilisateurs where entreprise_id = v_moi.entreprise_id and actif) >= v_limite then
            raise exception 'Limite de % comptes actifs atteinte pour ton offre.', v_limite using errcode = '42501';
        end if;
    end if;
    update utilisateurs set actif = p_actif where id = v_membre.id;
end;
$$;
revoke all on function modifier_membre_equipe(uuid, boolean) from public, anon;
grant execute on function modifier_membre_equipe(uuid, boolean) to authenticated;

-- Appelée uniquement par la fonction Edge creer-utilisateur-equipe (clé
-- service_role) : compte et crée sous le même verrou, impossible de
-- dépasser la limite avec des requêtes simultanées.
create or replace function lier_membre_equipe(p_entreprise_id uuid, p_auth_user_id uuid, p_nom text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_limite integer;
    v_id     uuid;
    v_ent    entreprises%rowtype;
begin
    if p_role not in ('vendeur', 'comptable', 'magasinier') then
        raise exception 'Rôle invalide.';
    end if;
    select * into v_ent from entreprises where id = p_entreprise_id;
    if v_ent.id is null or not v_ent.actif
       or (v_ent.date_expiration_abonnement is not null and v_ent.date_expiration_abonnement < current_date) then
        raise exception 'Abonnement expiré ou compte suspendu.';
    end if;
    perform pg_advisory_xact_lock(hashtext('equipe_' || p_entreprise_id::text));
    v_limite := coalesce(limite_utilisateurs_entreprise(p_entreprise_id), 2);
    if (select count(*) from utilisateurs where entreprise_id = p_entreprise_id and actif) >= v_limite then
        raise exception 'Limite de % comptes atteinte pour ton offre. Passe sur une offre supérieure pour ajouter d''autres membres.', v_limite;
    end if;
    insert into utilisateurs (entreprise_id, auth_user_id, nom, role)
    values (p_entreprise_id, p_auth_user_id, left(btrim(p_nom), 120), p_role)
    returning id into v_id;
    return v_id;
end;
$$;
revoke all on function lier_membre_equipe(uuid, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. UNE SEULE PÉRIODE D'ESSAI PAR NUMÉRO DE TÉLÉPHONE (M3)
-- ---------------------------------------------------------------------
create or replace function telephone_normalise(p text)
returns text
language sql
immutable
as $$
    select case
        when d is null or d = '' then null
        when length(d) > 10 and d like '229%' then substr(d, 4)
        else d
    end
    from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

create index if not exists idx_entreprises_telephone_normalise on entreprises (telephone_normalise(telephone));

drop function if exists creer_entreprise_et_gerant(text, text, text, text, text);

create or replace function creer_entreprise_et_gerant(
    p_nom_entreprise         text,
    p_regime_fiscal          text,
    p_telephone              text,
    p_nom_gerant             text,
    p_secteur_activite       text default 'autre',
    p_secteur_activite_autre text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_entreprise_id uuid;
    v_uid           uuid := auth.uid();
    v_essai         offres%rowtype;
    v_tel           text := telephone_normalise(p_telephone);
    v_deja_essaye   boolean;
begin
    if v_uid is null then
        raise exception 'Utilisateur non authentifié.';
    end if;
    if exists (select 1 from utilisateurs where auth_user_id = v_uid) then
        raise exception 'Ce compte est déjà associé à une entreprise.';
    end if;
    if exists (select 1 from agents_commerciaux where auth_user_id = v_uid) then
        raise exception 'Un compte d''agent commercial ne peut pas créer d''entreprise.';
    end if;
    if coalesce(p_secteur_activite, 'autre') not in
        ('quincaillerie', 'depot_boissons', 'alimentation_generale', 'pieces_detachees', 'autre') then
        raise exception 'Secteur d''activité invalide : %', p_secteur_activite;
    end if;
    if char_length(btrim(coalesce(p_nom_entreprise, ''))) not between 2 and 120
       or char_length(btrim(coalesce(p_nom_gerant, ''))) not between 2 and 120 then
        raise exception 'Nom de l''entreprise ou du gérant invalide.';
    end if;
    if v_tel is null or length(v_tel) < 8 or length(v_tel) > 15 then
        raise exception 'Numéro de téléphone obligatoire (8 chiffres minimum).';
    end if;

    -- Verrou par numéro : deux inscriptions simultanées avec le même
    -- numéro ne peuvent pas obtenir chacune un essai.
    perform pg_advisory_xact_lock(hashtext('essai_' || v_tel));
    v_deja_essaye := exists (select 1 from entreprises where telephone_normalise(telephone) = v_tel);

    select * into v_essai from offres where est_essai limit 1;

    insert into entreprises (
        nom, regime_fiscal, telephone, secteur_activite, secteur_activite_autre,
        plan_abonnement, periodicite_abonnement, date_expiration_abonnement
    )
    values (
        btrim(p_nom_entreprise),
        coalesce(p_regime_fiscal, 'forfait'),
        btrim(p_telephone),
        coalesce(p_secteur_activite, 'autre'),
        case when p_secteur_activite = 'autre' then left(p_secteur_activite_autre, 120) else null end,
        coalesce(v_essai.id, 'essai'),
        'mensuel',
        -- Numéro déjà utilisé : pas de nouvel essai, l'abonnement est à souscrire.
        case when v_deja_essaye then current_date - 1
             else (current_date + make_interval(days => coalesce(v_essai.duree_essai_jours, 7)))::date end
    )
    returning id into v_entreprise_id;

    insert into utilisateurs (entreprise_id, auth_user_id, nom, role)
    values (v_entreprise_id, v_uid, btrim(p_nom_gerant), 'gerant');

    return v_entreprise_id;
end;
$$;
revoke all on function creer_entreprise_et_gerant(text, text, text, text, text, text) from public, anon;
grant execute on function creer_entreprise_et_gerant(text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. DROITS D'EXÉCUTION DES NOUVELLES FONCTIONS
-- ---------------------------------------------------------------------
revoke all on function contexte_ecriture() from public, anon;
revoke all on function controler_ecriture() from public, anon;
revoke all on function proteger_colonnes_calculees() from public, anon;
revoke all on function controler_ligne_vente() from public, anon;
grant execute on function telephone_normalise(text) to authenticated;
grant execute on function seules_colonnes_modifiees(jsonb, jsonb, text[]) to authenticated;
