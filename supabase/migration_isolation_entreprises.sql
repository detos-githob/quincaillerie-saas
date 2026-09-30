-- =====================================================================
-- MIGRATION : ISOLATION ENTRE ENTREPRISES (multi-tenant)
-- À exécuter après migration_paiements_abonnement.sql.
--
-- Problème corrigé : plusieurs fonctions SECURITY DEFINER (qui contournent
-- la RLS) faisaient confiance au p_entreprise_id envoyé par le navigateur.
-- N'importe quel utilisateur connecté (l'inscription est libre) pouvait
-- donc, avec l'identifiant d'une autre entreprise, lire son tableau de
-- bord financier ou écrire des ventes, paiements, casses... chez elle.
--
-- Méthode (sans toucher à la logique métier) :
--   1. chaque fonction d'origine est renommée _interne_<nom> et rendue
--      inaccessible depuis l'API ;
--   2. une fonction « enveloppe » du même nom et de même signature
--      vérifie que l'appelant appartient bien à l'entreprise, que tous
--      les identifiants reçus (client, article, fournisseur, employé,
--      vente, dépôt) appartiennent à cette entreprise, force l'auteur de
--      l'opération à l'utilisateur connecté, puis appelle l'originale.
--   L'application n'a rien à changer.
--
-- Migration rejouable : relancée une seconde fois, elle ne renomme rien
-- et se contente de recréer les enveloppes.
--
-- ATTENTION pour la suite : une future migration qui ferait
-- « create or replace function creer_vente(...) » remplacerait
-- l'enveloppe par une version non protégée. Il faut désormais modifier
-- _interne_creer_vente (et ainsi de suite).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CONTRÔLES COMMUNS
-- ---------------------------------------------------------------------

-- Vérifie que l'appelant appartient à l'entreprise et renvoie son id
-- utilisateur. Appel côté serveur (service_role, tâches internes :
-- auth.uid() nul) : autorisé, renvoie null. Les rôles anon ne peuvent
-- de toute façon pas exécuter les enveloppes (droits révoqués plus bas).
create or replace function verifier_acces_entreprise(p_entreprise_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_id     uuid;
    v_ent    uuid;
    v_actif  boolean;
begin
    if auth.uid() is null then
        return null;
    end if;
    select id, entreprise_id, actif into v_id, v_ent, v_actif
    from utilisateurs where auth_user_id = auth.uid();
    if v_id is null or v_actif is false or p_entreprise_id is null or v_ent is distinct from p_entreprise_id then
        raise exception 'Accès refusé.' using errcode = '42501';
    end if;
    return v_id;
end;
$$;

-- Vérifie qu'un identifiant (facultatif) appartient à l'entreprise.
create or replace function verifier_reference(p_table text, p_id uuid, p_entreprise_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_existe boolean;
begin
    if p_id is null then return; end if;
    if p_table not in ('clients', 'articles', 'fournisseurs', 'employes', 'ventes', 'avoirs', 'depots', 'utilisateurs') then
        raise exception 'Table non autorisée : %', p_table;
    end if;
    execute format('select exists (select 1 from %I where id = $1 and entreprise_id = $2)', p_table)
        into v_existe using p_id, p_entreprise_id;
    if not v_existe then
        raise exception 'Accès refusé : élément introuvable dans ton entreprise.' using errcode = '42501';
    end if;
end;
$$;

-- Vérifie que tous les article_id d'un tableau de lignes appartiennent
-- à l'entreprise.
create or replace function verifier_articles_lignes(p_lignes jsonb, p_entreprise_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
        raise exception 'Lignes invalides.';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(p_lignes) l
        where l->>'article_id' is null
           or not exists (
                select 1 from articles a
                where a.id = (l->>'article_id')::uuid and a.entreprise_id = p_entreprise_id
           )
    ) then
        raise exception 'Accès refusé : article introuvable dans ton entreprise.' using errcode = '42501';
    end if;
end;
$$;

revoke all on function verifier_acces_entreprise(uuid) from public, anon, authenticated;
revoke all on function verifier_reference(text, uuid, uuid) from public, anon, authenticated;
revoke all on function verifier_articles_lignes(jsonb, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. RENOMMAGE DES ORIGINALES (une seule fois)
-- ---------------------------------------------------------------------
do $$
declare
    v_sig text;
    v_signatures text[] := array[
        'creer_vente(uuid,uuid,uuid,text,jsonb)',
        'creer_vente(uuid,uuid,uuid,text,jsonb,text)',
        'creer_avoir_vente(uuid,uuid,text,jsonb,uuid)',
        'creer_commande_fournisseur(uuid,uuid,uuid,date,jsonb)',
        'demarrer_inventaire(uuid,uuid,uuid)',
        'enregistrer_casse(uuid,uuid,numeric,numeric,text,uuid)',
        'enregistrer_mouvement_consigne(uuid,uuid,uuid,text,numeric,numeric,numeric,uuid)',
        'enregistrer_paiement_client(uuid,uuid,numeric,text,uuid)',
        'enregistrer_paiement_personnel(uuid,uuid,numeric,text,text,text,uuid)',
        'lister_stock_dormant(uuid,integer)',
        'tableau_decisionnel(uuid,integer)',
        'definir_permissions_utilisateur(uuid,uuid,jsonb)',
        'receptionner_commande_fournisseur(uuid,uuid,jsonb)',
        'valider_inventaire(uuid,uuid)'
    ];
    v_nom text;
    v_args text;
begin
    foreach v_sig in array v_signatures loop
        v_nom  := split_part(v_sig, '(', 1);
        v_args := '(' || split_part(v_sig, '(', 2);
        -- Déjà migrée : l'interne existe → on ne touche à rien.
        if to_regprocedure('public._interne_' || v_nom || v_args) is not null then
            continue;
        end if;
        if to_regprocedure('public.' || v_sig) is null then
            raise notice 'Fonction absente, ignorée : %', v_sig;
            continue;
        end if;
        execute format('alter function public.%s rename to %I', v_sig, '_interne_' || v_nom);
        execute format('revoke all on function public.%I%s from public, anon, authenticated', '_interne_' || v_nom, v_args);
    end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. ENVELOPPES PROTÉGÉES (même nom, même signature, mêmes défauts)
-- ---------------------------------------------------------------------

create or replace function creer_vente(
    p_entreprise_id uuid, p_client_id uuid, p_utilisateur_id uuid, p_mode_paiement text, p_lignes jsonb,
    p_type_facture text default 'simple'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u uuid := verifier_acces_entreprise(p_entreprise_id);
begin
    perform verifier_reference('clients', p_client_id, p_entreprise_id);
    perform verifier_articles_lignes(p_lignes, p_entreprise_id);
    return _interne_creer_vente(p_entreprise_id, p_client_id, coalesce(v_u, p_utilisateur_id),
                                p_mode_paiement, p_lignes, p_type_facture);
end;
$$;

-- Ancienne signature à 5 paramètres (conservée pour compatibilité).
create or replace function creer_vente(
    p_entreprise_id uuid, p_client_id uuid, p_utilisateur_id uuid, p_mode_paiement text, p_lignes jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u uuid := verifier_acces_entreprise(p_entreprise_id);
begin
    perform verifier_reference('clients', p_client_id, p_entreprise_id);
    perform verifier_articles_lignes(p_lignes, p_entreprise_id);
    return _interne_creer_vente(p_entreprise_id, p_client_id, coalesce(v_u, p_utilisateur_id),
                                p_mode_paiement, p_lignes);
end;
$$;

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
    return _interne_creer_commande_fournisseur(p_entreprise_id, p_fournisseur_id, coalesce(v_u, p_utilisateur_id),
                                               p_date_reception_prevue, p_lignes);
end;
$$;

create or replace function demarrer_inventaire(
    p_entreprise_id uuid, p_utilisateur_id uuid, p_depot_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u uuid := verifier_acces_entreprise(p_entreprise_id);
begin
    perform verifier_reference('depots', p_depot_id, p_entreprise_id);
    return _interne_demarrer_inventaire(p_entreprise_id, coalesce(v_u, p_utilisateur_id), p_depot_id);
end;
$$;

create or replace function enregistrer_casse(
    p_entreprise_id uuid, p_article_id uuid, p_quantite_bouteilles numeric, p_quantite_casiers numeric,
    p_motif text, p_utilisateur_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u uuid := verifier_acces_entreprise(p_entreprise_id);
begin
    perform verifier_reference('articles', p_article_id, p_entreprise_id);
    return _interne_enregistrer_casse(p_entreprise_id, p_article_id, p_quantite_bouteilles, p_quantite_casiers,
                                      p_motif, coalesce(v_u, p_utilisateur_id));
end;
$$;

create or replace function enregistrer_mouvement_consigne(
    p_entreprise_id uuid, p_client_id uuid, p_article_id uuid, p_type_mouvement text,
    p_quantite_casiers numeric, p_quantite_bouteilles numeric, p_montant numeric, p_utilisateur_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u uuid := verifier_acces_entreprise(p_entreprise_id);
begin
    perform verifier_reference('clients', p_client_id, p_entreprise_id);
    perform verifier_reference('articles', p_article_id, p_entreprise_id);
    return _interne_enregistrer_mouvement_consigne(p_entreprise_id, p_client_id, p_article_id, p_type_mouvement,
                                                   p_quantite_casiers, p_quantite_bouteilles, p_montant,
                                                   coalesce(v_u, p_utilisateur_id));
end;
$$;

create or replace function enregistrer_paiement_client(
    p_entreprise_id uuid, p_client_id uuid, p_montant numeric, p_mode_paiement text, p_utilisateur_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u uuid := verifier_acces_entreprise(p_entreprise_id);
begin
    perform verifier_reference('clients', p_client_id, p_entreprise_id);
    return _interne_enregistrer_paiement_client(p_entreprise_id, p_client_id, p_montant, p_mode_paiement,
                                                coalesce(v_u, p_utilisateur_id));
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
    return _interne_enregistrer_paiement_personnel(p_entreprise_id, p_employe_id, p_montant, p_periode, p_motif,
                                                   p_mode_paiement, coalesce(v_u, p_utilisateur_id));
end;
$$;

create or replace function lister_stock_dormant(p_entreprise_id uuid, p_jours_dormant integer default 60)
returns setof articles
language plpgsql
security definer
set search_path = public
as $$
begin
    perform verifier_acces_entreprise(p_entreprise_id);
    return query select * from _interne_lister_stock_dormant(p_entreprise_id, p_jours_dormant);
end;
$$;

create or replace function tableau_decisionnel(p_entreprise_id uuid, p_jours_dormant integer default 60)
returns table (
    ca_mois numeric, marge_mois numeric, total_creances numeric, argent_immobilise numeric,
    nombre_ruptures integer, nombre_stock_dormant integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
    perform verifier_acces_entreprise(p_entreprise_id);
    return query select * from _interne_tableau_decisionnel(p_entreprise_id, p_jours_dormant);
end;
$$;

create or replace function definir_permissions_utilisateur(p_entreprise_id uuid, p_utilisateur_id uuid, p_permissions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform verifier_acces_entreprise(p_entreprise_id);
    perform verifier_reference('utilisateurs', p_utilisateur_id, p_entreprise_id);
    perform _interne_definir_permissions_utilisateur(p_entreprise_id, p_utilisateur_id, p_permissions);
end;
$$;

-- Fonctions identifiées par un document (commande, inventaire) : on
-- retrouve l'entreprise du document puis on vérifie l'appelant.
create or replace function receptionner_commande_fournisseur(p_commande_id uuid, p_utilisateur_id uuid, p_lignes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ent uuid;
    v_u   uuid;
begin
    select entreprise_id into v_ent from commandes_fournisseur where id = p_commande_id;
    if v_ent is null then
        raise exception 'Commande fournisseur introuvable.';
    end if;
    v_u := verifier_acces_entreprise(v_ent);
    perform _interne_receptionner_commande_fournisseur(p_commande_id, coalesce(v_u, p_utilisateur_id), p_lignes);
end;
$$;

create or replace function valider_inventaire(p_inventaire_id uuid, p_utilisateur_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ent uuid;
    v_u   uuid;
begin
    select entreprise_id into v_ent from inventaires where id = p_inventaire_id;
    if v_ent is null then
        raise exception 'Inventaire introuvable.';
    end if;
    v_u := verifier_acces_entreprise(v_ent);
    perform _interne_valider_inventaire(p_inventaire_id, coalesce(v_u, p_utilisateur_id));
end;
$$;

-- ---------------------------------------------------------------------
-- 4. DROITS
-- ---------------------------------------------------------------------
-- Enveloppes : utilisateurs connectés uniquement (jamais anon).
revoke all on function creer_vente(uuid,uuid,uuid,text,jsonb,text) from public, anon;
revoke all on function creer_vente(uuid,uuid,uuid,text,jsonb) from public, anon;
revoke all on function creer_avoir_vente(uuid,uuid,text,jsonb,uuid) from public, anon;
revoke all on function creer_commande_fournisseur(uuid,uuid,uuid,date,jsonb) from public, anon;
revoke all on function demarrer_inventaire(uuid,uuid,uuid) from public, anon;
revoke all on function enregistrer_casse(uuid,uuid,numeric,numeric,text,uuid) from public, anon;
revoke all on function enregistrer_mouvement_consigne(uuid,uuid,uuid,text,numeric,numeric,numeric,uuid) from public, anon;
revoke all on function enregistrer_paiement_client(uuid,uuid,numeric,text,uuid) from public, anon;
revoke all on function enregistrer_paiement_personnel(uuid,uuid,numeric,text,text,text,uuid) from public, anon;
revoke all on function lister_stock_dormant(uuid,integer) from public, anon;
revoke all on function tableau_decisionnel(uuid,integer) from public, anon;
revoke all on function definir_permissions_utilisateur(uuid,uuid,jsonb) from public, anon;
revoke all on function receptionner_commande_fournisseur(uuid,uuid,jsonb) from public, anon;
revoke all on function valider_inventaire(uuid,uuid) from public, anon;

grant execute on function creer_vente(uuid,uuid,uuid,text,jsonb,text) to authenticated;
grant execute on function creer_vente(uuid,uuid,uuid,text,jsonb) to authenticated;
grant execute on function creer_avoir_vente(uuid,uuid,text,jsonb,uuid) to authenticated;
grant execute on function creer_commande_fournisseur(uuid,uuid,uuid,date,jsonb) to authenticated;
grant execute on function demarrer_inventaire(uuid,uuid,uuid) to authenticated;
grant execute on function enregistrer_casse(uuid,uuid,numeric,numeric,text,uuid) to authenticated;
grant execute on function enregistrer_mouvement_consigne(uuid,uuid,uuid,text,numeric,numeric,numeric,uuid) to authenticated;
grant execute on function enregistrer_paiement_client(uuid,uuid,numeric,text,uuid) to authenticated;
grant execute on function enregistrer_paiement_personnel(uuid,uuid,numeric,text,text,text,uuid) to authenticated;
grant execute on function lister_stock_dormant(uuid,integer) to authenticated;
grant execute on function tableau_decisionnel(uuid,integer) to authenticated;
grant execute on function definir_permissions_utilisateur(uuid,uuid,jsonb) to authenticated;
grant execute on function receptionner_commande_fournisseur(uuid,uuid,jsonb) to authenticated;
grant execute on function valider_inventaire(uuid,uuid) to authenticated;

-- Écriture interne du grand livre des créances : appelée uniquement par
-- les autres fonctions SQL (ventes, avoirs, paiements), jamais par l'app.
revoke all on function enregistrer_mouvement_creance(uuid,uuid,text,numeric,uuid,uuid,text,uuid) from public, anon, authenticated;

-- Fonctions de trigger : jamais appelables directement (hygiène).
do $$
declare r record;
begin
    for r in
        select p.oid::regprocedure as f
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
    loop
        execute format('revoke all on function %s from public, anon, authenticated', r.f);
    end loop;
end $$;
