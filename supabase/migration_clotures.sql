-- =====================================================================
-- MIGRATION : CLÔTURES JOURNALIÈRES, MENSUELLES ET ANNUELLES
-- À exécuter après migration_cgu_conditions_tontine.sql.
--
-- Principe (comme un « Z de caisse ») :
--   JOUR  : le gérant compte ses espèces, l'app calcule ce qui devrait
--           être en caisse, l'écart est enregistré et justifié. Une fois
--           la journée clôturée, plus aucune opération financière ne peut
--           y être ajoutée, modifiée ou supprimée (verrou serveur).
--   MOIS  : possible quand toutes les journées actives du mois sont
--           clôturées. Fige le résultat du mois et l'état de l'entreprise
--           (créances, épargne tontine, valeur du stock).
--   ANNÉE : possible quand tous les mois actifs de l'année sont clôturés.
--
-- Les clôtures se font dans l'ordre. Seule la plus récente d'un niveau
-- peut être rouverte, par le gérant, avec un motif (journalisé), et
-- seulement si le niveau supérieur n'est pas clôturé.
--
-- Tous les calculs utilisent l'heure locale de l'entreprise (Bénin par
-- défaut) et non l'UTC du serveur : une vente à 00h30 à Cotonou compte
-- bien pour le jour même.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COLONNES ENTREPRISE
-- ---------------------------------------------------------------------
alter table entreprises add column if not exists fuseau_horaire text not null default 'Africa/Porto-Novo';
-- Cache de la dernière journée clôturée : lu par le trigger de verrou à
-- chaque opération (lecture par clé primaire, coût négligeable).
alter table entreprises add column if not exists derniere_journee_cloturee date;

-- ---------------------------------------------------------------------
-- 2. TABLE DES CLÔTURES
-- ---------------------------------------------------------------------
create table if not exists clotures (
    id                      uuid primary key default gen_random_uuid(),
    entreprise_id           uuid not null references entreprises(id) on delete cascade,
    type_cloture            text not null check (type_cloture in ('jour', 'mois', 'annee')),
    date_debut              date not null,
    date_fin                date not null,
    statut                  text not null default 'validee' check (statut in ('validee', 'annulee')),

    -- Caisse (clôture journalière uniquement)
    fond_ouverture          numeric(14,2),
    especes_theoriques      numeric(14,2),
    especes_comptees        numeric(14,2),
    ecart_especes           numeric(14,2),
    fond_conserve           numeric(14,2),
    especes_retirees        numeric(14,2),
    mobile_money_theorique  numeric(14,2),

    -- Indicateurs clés (dupliqués hors JSON pour les listes et graphiques)
    chiffre_affaires_net    numeric(14,2) not null default 0,
    marge_brute             numeric(14,2) not null default 0,
    charges                 numeric(14,2) not null default 0,
    resultat_estime         numeric(14,2) not null default 0,

    donnees                 jsonb not null,           -- synthèse complète figée
    commentaire             text check (commentaire is null or char_length(commentaire) <= 1000),
    cloture_par             uuid references utilisateurs(id),
    cloture_le              timestamptz not null default now(),

    annulee_par             uuid references utilisateurs(id),
    annulee_le              timestamptz,
    motif_annulation        text,

    check (date_fin >= date_debut)
);

create unique index if not exists uq_clotures_validees
    on clotures(entreprise_id, type_cloture, date_debut)
    where statut = 'validee';
create index if not exists idx_clotures_entreprise_type_date
    on clotures(entreprise_id, type_cloture, date_debut desc);

alter table clotures enable row level security;

-- ---------------------------------------------------------------------
-- 3. HELPERS
-- ---------------------------------------------------------------------
create or replace function fuseau_entreprise(p_entreprise_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select fuseau_horaire from entreprises where id = p_entreprise_id), 'Africa/Porto-Novo');
$$;

-- Niveau d'accès effectif de l'appelant au module « clotures », calculé
-- côté serveur avec les mêmes règles que l'app (src/lib/permissions.ts) :
-- gérant = écriture ; surcharge individuelle si elle existe ; sinon
-- comptable = lecture, autres rôles = aucun.
create or replace function niveau_acces_clotures()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_id     uuid;
    v_role   text;
    v_niveau text;
begin
    select id, role into v_id, v_role from utilisateurs where auth_user_id = auth.uid();
    if v_role is null then return 'aucun'; end if;
    if v_role = 'gerant' then return 'ecriture'; end if;
    select niveau into v_niveau
    from permissions_utilisateur where utilisateur_id = v_id and module = 'clotures';
    if v_niveau is not null then return v_niveau; end if;
    return case when v_role = 'comptable' then 'lecture' else 'aucun' end;
end;
$$;

drop policy if exists "lecture_clotures" on clotures;
create policy "lecture_clotures"
    on clotures for select
    using (
        entreprise_id = entreprise_de_l_utilisateur_connecte()
        and niveau_acces_clotures() <> 'aucun'
    );
-- Aucune policy d'écriture : tout passe par les RPC ci-dessous.

-- Jours (heure locale) ayant au moins une opération financière.
create or replace function jours_avec_activite(p_entreprise_id uuid, p_debut date, p_fin date)
returns table (jour date)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_tz text := fuseau_entreprise(p_entreprise_id);
    t0   timestamptz := p_debut::timestamp at time zone v_tz;
    t1   timestamptz := (p_fin + 1)::timestamp at time zone v_tz;
begin
    if p_fin < p_debut then return; end if;
    return query
    select distinct (e.created_at at time zone v_tz)::date as jour
    from (
        select created_at from ventes              where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1
        union all
        select created_at from paiements           where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1
        union all
        select created_at from cotisations_tontine where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1
        union all
        select created_at from depenses            where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1
        union all
        select created_at from paiements_personnel where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1
        union all
        select created_at from avoirs              where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1
        union all
        select created_at from mouvements_consigne where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1
        union all
        select created_at from casses              where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1
    ) e
    order by 1;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. SYNTHÈSE D'UNE PÉRIODE (cœur du calcul)
-- ---------------------------------------------------------------------
create or replace function calculer_synthese_periode(p_entreprise_id uuid, p_debut date, p_fin date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_tz   text := fuseau_entreprise(p_entreprise_id);
    t0     timestamptz := p_debut::timestamp at time zone v_tz;
    t1     timestamptz := (p_fin + 1)::timestamp at time zone v_tz;

    v_ventes        jsonb;
    v_marge         numeric;
    v_avoirs        jsonb;
    v_marge_avoirs  numeric;
    v_creances      jsonb;
    v_tontine       jsonb;
    v_retraits      integer;
    v_depenses      jsonb;
    v_dep_cat       jsonb;
    v_personnel     jsonb;
    v_consignes     jsonb;
    v_casses        numeric;

    e_in  numeric; e_out numeric;
    m_in  numeric; m_out numeric;
    v_ca_net numeric; v_marge_nette numeric; v_charges numeric;
begin
    -- Ventes (y compris celles annulées ensuite : l'annulation apparaît
    -- comme avoir le jour où elle a lieu, ce qui garde les clôtures
    -- passées stables).
    select jsonb_build_object(
        'nombre',           count(*),
        'nombre_annulees',  count(*) filter (where statut = 'annulee'),
        'total',            coalesce(sum(montant_total), 0),
        'especes',          coalesce(sum(montant_paye) filter (where mode_paiement in ('especes', 'mixte')), 0),
        'mobile_money',     coalesce(sum(montant_paye) filter (where mode_paiement = 'mobile_money'), 0),
        'a_credit',         coalesce(sum(montant_total - montant_paye), 0)
    ) into v_ventes
    from ventes
    where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1;

    select coalesce(sum((lv.prix_unitaire - lv.prix_achat_unitaire) * lv.quantite - lv.remise), 0)
    into v_marge
    from lignes_vente lv
    join ventes v on v.id = lv.vente_id
    where v.entreprise_id = p_entreprise_id and v.created_at >= t0 and v.created_at < t1;

    -- Avoirs : remboursés en caisse si la vente d'origine était payée
    -- comptant, imputés sur la créance si elle était à crédit.
    select jsonb_build_object(
        'nombre',       count(*),
        'total',        coalesce(sum(a.montant_total), 0),
        'especes',      coalesce(sum(a.montant_total) filter (where v.mode_paiement in ('especes', 'mixte')), 0),
        'mobile_money', coalesce(sum(a.montant_total) filter (where v.mode_paiement = 'mobile_money'), 0),
        'credit',       coalesce(sum(a.montant_total) filter (where v.mode_paiement = 'credit'), 0)
    ) into v_avoirs
    from avoirs a
    join ventes v on v.id = a.vente_id
    where a.entreprise_id = p_entreprise_id and a.created_at >= t0 and a.created_at < t1;

    select coalesce(sum((la.prix_unitaire - lv.prix_achat_unitaire) * la.quantite), 0)
    into v_marge_avoirs
    from lignes_avoir la
    join avoirs a on a.id = la.avoir_id
    join lignes_vente lv on lv.id = la.ligne_vente_id
    where a.entreprise_id = p_entreprise_id and a.created_at >= t0 and a.created_at < t1;

    -- Encaissements de créances clients
    select jsonb_build_object(
        'nombre',       count(*),
        'total',        coalesce(sum(montant), 0),
        'especes',      coalesce(sum(montant) filter (where mode_paiement = 'especes'), 0),
        'mobile_money', coalesce(sum(montant) filter (where mode_paiement = 'mobile_money'), 0)
    ) into v_creances
    from paiements
    where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1;

    -- Tontine : cotisations encaissées (épargne due aux clients, pas du
    -- chiffre d'affaires) et tontines soldées par retrait de marchandise.
    select jsonb_build_object(
        'nombre',       count(*),
        'total',        coalesce(sum(montant), 0),
        'especes',      coalesce(sum(montant) filter (where mode_paiement = 'especes'), 0),
        'mobile_money', coalesce(sum(montant) filter (where mode_paiement = 'mobile_money'), 0)
    ) into v_tontine
    from cotisations_tontine
    where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1;

    select count(distinct reference_document) into v_retraits
    from mouvements_stock
    where entreprise_id = p_entreprise_id and motif = 'Retrait tontine'
      and created_at >= t0 and created_at < t1;

    -- Dépenses
    select jsonb_build_object(
        'nombre',       count(*),
        'total',        coalesce(sum(montant), 0),
        'especes',      coalesce(sum(montant) filter (where mode_paiement = 'especes'), 0),
        'mobile_money', coalesce(sum(montant) filter (where mode_paiement = 'mobile_money'), 0),
        'virement',     coalesce(sum(montant) filter (where mode_paiement = 'virement'), 0)
    ) into v_depenses
    from depenses
    where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1;

    select coalesce(jsonb_object_agg(categorie, total), '{}'::jsonb) into v_dep_cat
    from (
        select categorie, sum(montant) as total
        from depenses
        where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1
        group by categorie
    ) c;
    v_depenses := v_depenses || jsonb_build_object('par_categorie', v_dep_cat);

    -- Paiements du personnel
    select jsonb_build_object(
        'nombre',       count(*),
        'total',        coalesce(sum(montant), 0),
        'especes',      coalesce(sum(montant) filter (where mode_paiement = 'especes'), 0),
        'mobile_money', coalesce(sum(montant) filter (where mode_paiement = 'mobile_money'), 0),
        'virement',     coalesce(sum(montant) filter (where mode_paiement = 'virement'), 0)
    ) into v_personnel
    from paiements_personnel
    where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1;

    -- Consignes (dépôt de boissons) : un rachat est encaissé en espèces.
    select jsonb_build_object(
        'rachats',           coalesce(sum(montant) filter (where type_mouvement = 'rachat_consigne'), 0),
        'casiers_sortis',    coalesce(sum(quantite_casiers) filter (where type_mouvement = 'sortie_consigne'), 0),
        'casiers_retournes', coalesce(sum(quantite_casiers) filter (where type_mouvement = 'retour_consigne'), 0)
    ) into v_consignes
    from mouvements_consigne
    where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1;

    select coalesce(sum(valeur_perte), 0) into v_casses
    from casses
    where entreprise_id = p_entreprise_id and created_at >= t0 and created_at < t1;

    -- Trésorerie
    e_in  := (v_ventes->>'especes')::numeric + (v_creances->>'especes')::numeric
           + (v_tontine->>'especes')::numeric + (v_consignes->>'rachats')::numeric;
    e_out := (v_depenses->>'especes')::numeric + (v_personnel->>'especes')::numeric
           + (v_avoirs->>'especes')::numeric;
    m_in  := (v_ventes->>'mobile_money')::numeric + (v_creances->>'mobile_money')::numeric
           + (v_tontine->>'mobile_money')::numeric;
    m_out := (v_depenses->>'mobile_money')::numeric + (v_personnel->>'mobile_money')::numeric
           + (v_avoirs->>'mobile_money')::numeric;

    -- Résultat estimé
    v_ca_net       := (v_ventes->>'total')::numeric - (v_avoirs->>'total')::numeric;
    v_marge_nette  := v_marge - v_marge_avoirs;
    v_charges      := (v_depenses->>'total')::numeric + (v_personnel->>'total')::numeric;

    return jsonb_build_object(
        'periode',                jsonb_build_object('debut', p_debut, 'fin', p_fin, 'fuseau', v_tz),
        'ventes',                 v_ventes,
        'avoirs',                 v_avoirs,
        'encaissements_creances', v_creances,
        'tontine',                v_tontine || jsonb_build_object('tontines_soldees', v_retraits),
        'depenses',               v_depenses,
        'personnel',              v_personnel,
        'consignes',              v_consignes,
        'casses',                 v_casses,
        'tresorerie', jsonb_build_object(
            'especes',      jsonb_build_object('entrees', e_in, 'sorties', e_out, 'flux', e_in - e_out),
            'mobile_money', jsonb_build_object('entrees', m_in, 'sorties', m_out, 'flux', m_in - m_out)
        ),
        'resultat', jsonb_build_object(
            'chiffre_affaires_net', v_ca_net,
            'marge_brute',          v_marge_nette,
            'charges',              v_charges,
            'pertes',               v_casses,
            'resultat_estime',      v_marge_nette - v_charges - v_casses
        )
    );
end;
$$;

-- État instantané (créances, épargne tontine, stock) + top articles :
-- ajouté aux clôtures mensuelles et annuelles.
create or replace function calculer_etat_entreprise(p_entreprise_id uuid, p_debut date, p_fin date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_tz  text := fuseau_entreprise(p_entreprise_id);
    t0    timestamptz := p_debut::timestamp at time zone v_tz;
    t1    timestamptz := (p_fin + 1)::timestamp at time zone v_tz;
    v_top jsonb;
begin
    select coalesce(jsonb_agg(t order by t.montant desc), '[]'::jsonb) into v_top
    from (
        select a.designation, sum(lv.quantite) as quantite, sum(lv.montant_ligne) as montant
        from lignes_vente lv
        join ventes v on v.id = lv.vente_id
        join articles a on a.id = lv.article_id
        where v.entreprise_id = p_entreprise_id and v.created_at >= t0 and v.created_at < t1
        group by a.designation
        order by sum(lv.montant_ligne) desc
        limit 5
    ) t;

    return jsonb_build_object(
        'creances_clients',  (select coalesce(sum(solde_credit), 0) from clients where entreprise_id = p_entreprise_id),
        'epargne_tontine',   (select coalesce(sum(montant_cumule), 0) from tontines
                              where entreprise_id = p_entreprise_id and statut in ('en_cours', 'atteint')),
        'valeur_stock_achat', (select coalesce(sum(stock_actuel * prix_achat), 0) from articles
                              where entreprise_id = p_entreprise_id and stock_actuel > 0),
        'top_articles',      v_top,
        'releve_le',         now()
    );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. RÈGLES D'ÉLIGIBILITÉ (null = clôturable, sinon la raison)
-- ---------------------------------------------------------------------
create or replace function raison_non_cloturable(p_entreprise_id uuid, p_type text, p_debut date)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_tz            text := fuseau_entreprise(p_entreprise_id);
    v_aujourdhui    date := (now() at time zone v_tz)::date;
    v_fin           date;
    v_der_jour      date;
    v_der_mois      date;
    v_der_annee     date;
    v_jour          date;
begin
    select max(date_debut) into v_der_jour  from clotures where entreprise_id = p_entreprise_id and type_cloture = 'jour'  and statut = 'validee';
    select max(date_debut) into v_der_mois  from clotures where entreprise_id = p_entreprise_id and type_cloture = 'mois'  and statut = 'validee';
    select max(date_debut) into v_der_annee from clotures where entreprise_id = p_entreprise_id and type_cloture = 'annee' and statut = 'validee';

    if exists (select 1 from clotures where entreprise_id = p_entreprise_id and type_cloture = p_type
               and date_debut = p_debut and statut = 'validee') then
        return 'Cette période est déjà clôturée.';
    end if;

    if p_type = 'jour' then
        if p_debut > v_aujourdhui then
            return 'Impossible de clôturer une journée future.';
        end if;
        if v_der_jour is not null and p_debut < v_der_jour then
            return 'Les journées se clôturent dans l''ordre : la dernière clôture date du '
                || to_char(v_der_jour, 'DD/MM/YYYY') || '.';
        end if;
        if v_der_jour is not null then
            select min(j.jour) into v_jour from jours_avec_activite(p_entreprise_id, v_der_jour + 1, p_debut - 1) j;
            if v_jour is not null then
                return 'Clôture d''abord la journée du ' || to_char(v_jour, 'DD/MM/YYYY') || '.';
            end if;
        end if;
        if exists (select 1 from clotures where entreprise_id = p_entreprise_id and type_cloture in ('mois', 'annee')
                   and statut = 'validee' and p_debut between date_debut and date_fin) then
            return 'Le mois de cette journée est déjà clôturé.';
        end if;
        return null;
    end if;

    if p_type = 'mois' then
        v_fin := (p_debut + interval '1 month' - interval '1 day')::date;
        if v_fin > v_aujourdhui then
            return 'Le mois n''est pas terminé.';
        end if;
        if v_der_jour is null then
            return 'Clôture d''abord les journées de ce mois.';
        end if;
        if v_fin = v_aujourdhui and v_der_jour < v_fin then
            return 'Clôture d''abord la journée d''aujourd''hui.';
        end if;
        select min(j.jour) into v_jour
        from jours_avec_activite(p_entreprise_id, greatest(p_debut, v_der_jour + 1), v_fin) j;
        if v_jour is not null then
            return 'La journée du ' || to_char(v_jour, 'DD/MM/YYYY') || ' n''est pas clôturée.';
        end if;
        if v_der_mois is not null and p_debut < v_der_mois then
            return 'Les mois se clôturent dans l''ordre : le dernier clôturé est '
                || to_char(v_der_mois, 'MM/YYYY') || '.';
        end if;
        if v_der_mois is not null then
            select min(j.jour) into v_jour
            from jours_avec_activite(p_entreprise_id, (v_der_mois + interval '1 month')::date, p_debut - 1) j;
            if v_jour is not null then
                return 'Clôture d''abord le mois de ' || to_char(v_jour, 'MM/YYYY') || '.';
            end if;
        end if;
        if exists (select 1 from clotures where entreprise_id = p_entreprise_id and type_cloture = 'annee'
                   and statut = 'validee' and p_debut between date_debut and date_fin) then
            return 'L''année de ce mois est déjà clôturée.';
        end if;
        return null;
    end if;

    if p_type = 'annee' then
        v_fin := (p_debut + interval '1 year' - interval '1 day')::date;
        if v_der_mois is null then
            return 'Clôture d''abord les mois de cette année.';
        end if;
        if v_der_mois < date_trunc('month', v_fin::timestamp)::date then
            if v_fin >= v_aujourdhui then
                return 'L''année n''est pas terminée.';
            end if;
            select min(j.jour) into v_jour
            from jours_avec_activite(p_entreprise_id,
                                     greatest(p_debut, (v_der_mois + interval '1 month')::date), v_fin) j;
            if v_jour is not null then
                return 'Clôture d''abord le mois de ' || to_char(v_jour, 'MM/YYYY') || '.';
            end if;
        end if;
        if v_der_annee is not null and p_debut < v_der_annee then
            return 'Les années se clôturent dans l''ordre.';
        end if;
        if v_der_annee is not null then
            select min(j.jour) into v_jour
            from jours_avec_activite(p_entreprise_id, (v_der_annee + interval '1 year')::date, p_debut - 1) j;
            if v_jour is not null then
                return 'Clôture d''abord l''année ' || to_char(v_jour, 'YYYY') || '.';
            end if;
        end if;
        return null;
    end if;

    return 'Type de clôture invalide.';
end;
$$;

-- Début de période normalisé selon le type.
create or replace function debut_periode(p_type text, p_date date)
returns date
language sql
immutable
as $$
    select case p_type
        when 'jour'  then p_date
        when 'mois'  then date_trunc('month', p_date::timestamp)::date
        when 'annee' then date_trunc('year', p_date::timestamp)::date
    end;
$$;

create or replace function fin_periode(p_type text, p_debut date)
returns date
language sql
immutable
as $$
    select case p_type
        when 'jour'  then p_debut
        when 'mois'  then (p_debut + interval '1 month' - interval '1 day')::date
        when 'annee' then (p_debut + interval '1 year' - interval '1 day')::date
    end;
$$;

-- ---------------------------------------------------------------------
-- 6. RPC : ÉTAT GLOBAL (ce qui reste à clôturer)
-- ---------------------------------------------------------------------
create or replace function etat_clotures()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_ent           uuid := entreprise_de_l_utilisateur_connecte();
    v_tz            text;
    v_aujourdhui    date;
    v_der_jour      date;
    v_der_mois      date;
    v_der_annee     date;
    v_en_attente    date[];
    v_prochaine     date;
    v_prochain_mois date;
    v_prochaine_an  date;
begin
    if v_ent is null or niveau_acces_clotures() = 'aucun' then
        raise exception 'Accès refusé.';
    end if;

    v_tz := fuseau_entreprise(v_ent);
    v_aujourdhui := (now() at time zone v_tz)::date;

    select max(date_debut) into v_der_jour  from clotures where entreprise_id = v_ent and type_cloture = 'jour'  and statut = 'validee';
    select max(date_debut) into v_der_mois  from clotures where entreprise_id = v_ent and type_cloture = 'mois'  and statut = 'validee';
    select max(date_debut) into v_der_annee from clotures where entreprise_id = v_ent and type_cloture = 'annee' and statut = 'validee';

    if v_der_jour is null then
        -- Première utilisation : l'historique antérieur n'est pas exigé.
        v_en_attente := '{}';
        v_prochaine := v_aujourdhui;
    else
        select coalesce(array_agg(j.jour order by j.jour), '{}') into v_en_attente
        from (select jour from jours_avec_activite(v_ent, v_der_jour + 1, v_aujourdhui) limit 62) j;
        v_prochaine := case
            when v_der_jour >= v_aujourdhui then null
            else coalesce(v_en_attente[1], v_aujourdhui)
        end;
    end if;

    v_prochain_mois := case
        when v_der_mois is not null then (v_der_mois + interval '1 month')::date
        else (select date_trunc('month', min(date_debut)::timestamp)::date from clotures
              where entreprise_id = v_ent and type_cloture = 'jour' and statut = 'validee')
    end;
    v_prochaine_an := case
        when v_der_annee is not null then (v_der_annee + interval '1 year')::date
        else (select date_trunc('year', min(date_debut)::timestamp)::date from clotures
              where entreprise_id = v_ent and type_cloture = 'mois' and statut = 'validee')
    end;

    return jsonb_build_object(
        'aujourdhui',                v_aujourdhui,
        'derniere_journee',          v_der_jour,
        'dernier_mois',              v_der_mois,
        'derniere_annee',            v_der_annee,
        'journees_en_attente',       to_jsonb(v_en_attente),
        'prochaine_journee',         v_prochaine,
        'prochain_mois',             v_prochain_mois,
        'prochain_mois_raison',      case when v_prochain_mois is null then null
                                          else raison_non_cloturable(v_ent, 'mois', v_prochain_mois) end,
        'prochaine_annee',           v_prochaine_an,
        'prochaine_annee_raison',    case when v_prochaine_an is null then null
                                          else raison_non_cloturable(v_ent, 'annee', v_prochaine_an) end
    );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. RPC : APERÇU D'UNE PÉRIODE (avant ou après clôture)
-- ---------------------------------------------------------------------
create or replace function apercu_cloture(p_type text, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_ent       uuid := entreprise_de_l_utilisateur_connecte();
    v_debut     date;
    v_fin       date;
    v_existante clotures%rowtype;
    v_synthese  jsonb;
    v_fond      numeric;
    v_extra     jsonb := '{}'::jsonb;
begin
    if v_ent is null or niveau_acces_clotures() = 'aucun' then
        raise exception 'Accès refusé.';
    end if;
    if p_type not in ('jour', 'mois', 'annee') or p_date is null then
        raise exception 'Période invalide.';
    end if;

    v_debut := debut_periode(p_type, p_date);
    v_fin   := fin_periode(p_type, v_debut);

    select * into v_existante from clotures
    where entreprise_id = v_ent and type_cloture = p_type and date_debut = v_debut and statut = 'validee';

    if found then
        return jsonb_build_object('cloture', to_jsonb(v_existante), 'synthese', v_existante.donnees);
    end if;

    v_synthese := calculer_synthese_periode(v_ent, v_debut, v_fin);

    if p_type = 'jour' then
        select fond_conserve into v_fond from clotures
        where entreprise_id = v_ent and type_cloture = 'jour' and statut = 'validee' and date_debut < v_debut
        order by date_debut desc limit 1;
        v_extra := jsonb_build_object(
            'fond_ouverture',      v_fond,                    -- null = première clôture, à saisir
            'premiere_cloture',    v_fond is null
        );
    else
        v_extra := jsonb_build_object(
            'etat',       calculer_etat_entreprise(v_ent, v_debut, v_fin),
            'journees',   (select jsonb_build_object(
                               'nombre', count(*),
                               'ecart_total', coalesce(sum(ecart_especes), 0))
                           from clotures where entreprise_id = v_ent and type_cloture = 'jour'
                           and statut = 'validee' and date_debut between v_debut and v_fin)
        );
        if p_type = 'annee' then
            v_extra := v_extra || jsonb_build_object('par_mois', (
                select coalesce(jsonb_agg(jsonb_build_object(
                    'mois',   m.debut,
                    'chiffre_affaires_net', (s.v->'resultat'->>'chiffre_affaires_net')::numeric,
                    'resultat_estime',      (s.v->'resultat'->>'resultat_estime')::numeric
                ) order by m.debut), '[]'::jsonb)
                from (select generate_series(v_debut::timestamp, v_fin::timestamp, interval '1 month')::date as debut) m
                cross join lateral (
                    select calculer_synthese_periode(v_ent, m.debut, fin_periode('mois', m.debut)) as v
                ) s
            ));
        end if;
    end if;

    return jsonb_build_object(
        'cloture',  null,
        'synthese', v_synthese || v_extra,
        'raison_non_cloturable', raison_non_cloturable(v_ent, p_type, v_debut)
    );
end;
$$;

-- ---------------------------------------------------------------------
-- 8. RPC : CLÔTURER
-- ---------------------------------------------------------------------
create or replace function cloturer_periode(
    p_type              text,
    p_date              date,
    p_especes_comptees  numeric default null,
    p_fond_conserve     numeric default null,
    p_fond_ouverture    numeric default null,
    p_commentaire       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ent           uuid := entreprise_de_l_utilisateur_connecte();
    v_utilisateur   uuid;
    v_debut         date;
    v_fin           date;
    v_raison        text;
    v_synthese      jsonb;
    v_fond          numeric;
    v_theorique     numeric;
    v_ecart         numeric;
    v_commentaire   text := nullif(btrim(coalesce(p_commentaire, '')), '');
    v_id            uuid;
begin
    if v_ent is null or niveau_acces_clotures() <> 'ecriture' then
        raise exception 'Seul le gérant (ou un membre autorisé) peut clôturer une période.';
    end if;
    if p_type not in ('jour', 'mois', 'annee') or p_date is null then
        raise exception 'Période invalide.';
    end if;

    select id into v_utilisateur from utilisateurs where auth_user_id = auth.uid();

    -- Sérialise les clôtures d'une même entreprise.
    perform 1 from entreprises where id = v_ent for update;

    v_debut := debut_periode(p_type, p_date);
    v_fin   := fin_periode(p_type, v_debut);

    v_raison := raison_non_cloturable(v_ent, p_type, v_debut);
    if v_raison is not null then
        raise exception '%', v_raison;
    end if;

    v_synthese := calculer_synthese_periode(v_ent, v_debut, v_fin);

    if p_type = 'jour' then
        if p_especes_comptees is null or p_especes_comptees < 0 then
            raise exception 'Saisis le montant des espèces comptées en caisse.';
        end if;
        if p_fond_conserve is null or p_fond_conserve < 0 or p_fond_conserve > p_especes_comptees then
            raise exception 'Le fond conservé doit être compris entre 0 et les espèces comptées.';
        end if;

        select fond_conserve into v_fond from clotures
        where entreprise_id = v_ent and type_cloture = 'jour' and statut = 'validee' and date_debut < v_debut
        order by date_debut desc limit 1;
        if v_fond is null then
            v_fond := coalesce(p_fond_ouverture, 0);
            if v_fond < 0 then raise exception 'Le fond d''ouverture ne peut pas être négatif.'; end if;
        end if;

        v_theorique := v_fond + (v_synthese->'tresorerie'->'especes'->>'flux')::numeric;
        v_ecart := p_especes_comptees - v_theorique;

        if v_ecart <> 0 and v_commentaire is null then
            raise exception 'Un écart de caisse de % F doit être expliqué en commentaire.', round(v_ecart);
        end if;
    else
        v_synthese := v_synthese || jsonb_build_object(
            'etat',     calculer_etat_entreprise(v_ent, v_debut, v_fin),
            'journees', (select jsonb_build_object('nombre', count(*), 'ecart_total', coalesce(sum(ecart_especes), 0))
                         from clotures where entreprise_id = v_ent and type_cloture = 'jour'
                         and statut = 'validee' and date_debut between v_debut and v_fin)
        );
        if p_type = 'annee' then
            v_synthese := v_synthese || jsonb_build_object('par_mois', (
                select coalesce(jsonb_agg(jsonb_build_object(
                    'mois', c.date_debut,
                    'chiffre_affaires_net', c.chiffre_affaires_net,
                    'resultat_estime', c.resultat_estime
                ) order by c.date_debut), '[]'::jsonb)
                from clotures c
                where c.entreprise_id = v_ent and c.type_cloture = 'mois' and c.statut = 'validee'
                  and c.date_debut between v_debut and v_fin
            ));
        end if;
    end if;

    insert into clotures (
        entreprise_id, type_cloture, date_debut, date_fin,
        fond_ouverture, especes_theoriques, especes_comptees, ecart_especes,
        fond_conserve, especes_retirees, mobile_money_theorique,
        chiffre_affaires_net, marge_brute, charges, resultat_estime,
        donnees, commentaire, cloture_par
    )
    values (
        v_ent, p_type, v_debut, v_fin,
        case when p_type = 'jour' then v_fond end,
        case when p_type = 'jour' then v_theorique end,
        case when p_type = 'jour' then p_especes_comptees end,
        case when p_type = 'jour' then v_ecart end,
        case when p_type = 'jour' then p_fond_conserve end,
        case when p_type = 'jour' then p_especes_comptees - p_fond_conserve end,
        case when p_type = 'jour' then (v_synthese->'tresorerie'->'mobile_money'->>'flux')::numeric end,
        (v_synthese->'resultat'->>'chiffre_affaires_net')::numeric,
        (v_synthese->'resultat'->>'marge_brute')::numeric,
        (v_synthese->'resultat'->>'charges')::numeric,
        (v_synthese->'resultat'->>'resultat_estime')::numeric,
        v_synthese, v_commentaire, v_utilisateur
    )
    returning id into v_id;

    if p_type = 'jour' then
        update entreprises set derniere_journee_cloturee = v_debut where id = v_ent;
    end if;

    insert into journal_audit (entreprise_id, utilisateur_id, action, table_concernee, enregistrement_id, donnees_apres)
    values (v_ent, v_utilisateur, 'cloture_' || p_type, 'clotures', v_id,
            jsonb_build_object('debut', v_debut, 'fin', v_fin, 'ecart_especes', v_ecart));

    return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. RPC : ROUVRIR (gérant uniquement, motif obligatoire)
-- ---------------------------------------------------------------------
create or replace function rouvrir_cloture(p_cloture_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ent         uuid := entreprise_de_l_utilisateur_connecte();
    v_utilisateur uuid;
    v_role        text;
    v_c           clotures%rowtype;
    v_motif       text := btrim(coalesce(p_motif, ''));
begin
    select id, role into v_utilisateur, v_role from utilisateurs where auth_user_id = auth.uid();
    if v_role is distinct from 'gerant' then
        raise exception 'Seul le gérant peut rouvrir une période clôturée.';
    end if;
    if char_length(v_motif) < 5 or char_length(v_motif) > 500 then
        raise exception 'Indique le motif de la réouverture (5 à 500 caractères).';
    end if;

    perform 1 from entreprises where id = v_ent for update;

    select * into v_c from clotures where id = p_cloture_id and entreprise_id = v_ent for update;
    if not found or v_c.statut <> 'validee' then
        raise exception 'Clôture introuvable.';
    end if;

    if exists (select 1 from clotures where entreprise_id = v_ent and type_cloture = v_c.type_cloture
               and statut = 'validee' and date_debut > v_c.date_debut) then
        raise exception 'Seule la clôture la plus récente peut être rouverte.';
    end if;

    if v_c.type_cloture = 'jour' and exists (
        select 1 from clotures where entreprise_id = v_ent and type_cloture = 'mois' and statut = 'validee'
        and v_c.date_debut between date_debut and date_fin) then
        raise exception 'Le mois de cette journée est clôturé : rouvre d''abord le mois.';
    end if;
    if v_c.type_cloture = 'mois' and exists (
        select 1 from clotures where entreprise_id = v_ent and type_cloture = 'annee' and statut = 'validee'
        and v_c.date_debut between date_debut and date_fin) then
        raise exception 'L''année de ce mois est clôturée : rouvre d''abord l''année.';
    end if;

    update clotures
        set statut = 'annulee', annulee_par = v_utilisateur, annulee_le = now(), motif_annulation = v_motif
        where id = v_c.id;

    if v_c.type_cloture = 'jour' then
        update entreprises
            set derniere_journee_cloturee = (select max(date_debut) from clotures
                                             where entreprise_id = v_ent and type_cloture = 'jour' and statut = 'validee')
            where id = v_ent;
    end if;

    insert into journal_audit (entreprise_id, utilisateur_id, action, table_concernee, enregistrement_id, donnees_avant, donnees_apres)
    values (v_ent, v_utilisateur, 'reouverture_' || v_c.type_cloture, 'clotures', v_c.id,
            jsonb_build_object('debut', v_c.date_debut, 'fin', v_c.date_fin),
            jsonb_build_object('motif', v_motif));
end;
$$;

-- ---------------------------------------------------------------------
-- 10. VERROU : aucune opération financière dans une journée clôturée
-- Arguments du trigger = colonnes qu'on peut encore modifier sur une
-- ligne d'une journée clôturée (ex : ventes.statut, pour qu'un avoir
-- émis aujourd'hui puisse marquer « annulée » une vente ancienne ; la
-- correction financière est portée par l'avoir, daté d'aujourd'hui).
-- ---------------------------------------------------------------------
create or replace function bloquer_periode_cloturee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ent       uuid;
    v_der       date;
    v_tz        text;
    v_date_new  date;
    v_date_old  date;
    v_libres    text[] := coalesce(tg_argv, '{}'::text[]);
    v_message   text;
begin
    if tg_op = 'DELETE' then v_ent := old.entreprise_id; else v_ent := new.entreprise_id; end if;

    select derniere_journee_cloturee, coalesce(fuseau_horaire, 'Africa/Porto-Novo')
    into v_der, v_tz
    from entreprises where id = v_ent;

    if v_der is null then
        if tg_op = 'DELETE' then return old; end if;
        return new;
    end if;

    v_message := 'La journée du ' || to_char(v_der, 'DD/MM/YYYY')
        || ' est clôturée : aucune opération ne peut plus y être ajoutée, modifiée ou supprimée.'
        || ' Le gérant peut la rouvrir depuis l''onglet Clôtures.';

    if tg_op = 'INSERT' then
        v_date_new := (coalesce(new.created_at, now()) at time zone v_tz)::date;
        if v_date_new <= v_der then
            raise exception '%', v_message using errcode = 'P0001';
        end if;
        return new;
    end if;

    v_date_old := (old.created_at at time zone v_tz)::date;

    if tg_op = 'DELETE' then
        if v_date_old <= v_der then
            raise exception '%', v_message using errcode = 'P0001';
        end if;
        return old;
    end if;

    -- UPDATE
    v_date_new := (new.created_at at time zone v_tz)::date;
    if (v_date_old <= v_der or v_date_new <= v_der)
       and (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
        raise exception '%', v_message using errcode = 'P0001';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_verrou_cloture on ventes;
create trigger trg_verrou_cloture before insert or update or delete on ventes
    for each row execute function bloquer_periode_cloturee('statut');

drop trigger if exists trg_verrou_cloture on paiements;
create trigger trg_verrou_cloture before insert or update or delete on paiements
    for each row execute function bloquer_periode_cloturee();

drop trigger if exists trg_verrou_cloture on cotisations_tontine;
create trigger trg_verrou_cloture before insert or update or delete on cotisations_tontine
    for each row execute function bloquer_periode_cloturee();

drop trigger if exists trg_verrou_cloture on depenses;
create trigger trg_verrou_cloture before insert or update or delete on depenses
    for each row execute function bloquer_periode_cloturee();

drop trigger if exists trg_verrou_cloture on paiements_personnel;
create trigger trg_verrou_cloture before insert or update or delete on paiements_personnel
    for each row execute function bloquer_periode_cloturee();

drop trigger if exists trg_verrou_cloture on avoirs;
create trigger trg_verrou_cloture before insert or update or delete on avoirs
    for each row execute function bloquer_periode_cloturee();

drop trigger if exists trg_verrou_cloture on mouvements_consigne;
create trigger trg_verrou_cloture before insert or update or delete on mouvements_consigne
    for each row execute function bloquer_periode_cloturee();

drop trigger if exists trg_verrou_cloture on casses;
create trigger trg_verrou_cloture before insert or update or delete on casses
    for each row execute function bloquer_periode_cloturee();

-- ---------------------------------------------------------------------
-- 11. DROITS D'EXÉCUTION
-- Les fonctions internes (calculs) ne sont jamais appelables depuis
-- l'API : elles ne vérifient pas l'entreprise de l'appelant.
-- ---------------------------------------------------------------------
revoke all on function fuseau_entreprise(uuid) from public, anon, authenticated;
revoke all on function jours_avec_activite(uuid, date, date) from public, anon, authenticated;
revoke all on function calculer_synthese_periode(uuid, date, date) from public, anon, authenticated;
revoke all on function calculer_etat_entreprise(uuid, date, date) from public, anon, authenticated;
revoke all on function raison_non_cloturable(uuid, text, date) from public, anon, authenticated;

revoke all on function niveau_acces_clotures() from public, anon;
revoke all on function etat_clotures() from public, anon;
revoke all on function apercu_cloture(text, date) from public, anon;
revoke all on function cloturer_periode(text, date, numeric, numeric, numeric, text) from public, anon;
revoke all on function rouvrir_cloture(uuid, text) from public, anon;

grant execute on function niveau_acces_clotures() to authenticated;
grant execute on function etat_clotures() to authenticated;
grant execute on function apercu_cloture(text, date) to authenticated;
grant execute on function cloturer_periode(text, date, numeric, numeric, numeric, text) to authenticated;
grant execute on function rouvrir_cloture(uuid, text) to authenticated;
