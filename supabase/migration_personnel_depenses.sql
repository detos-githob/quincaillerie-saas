-- =====================================================================
-- MIGRATION : PERSONNEL (PAIEMENTS + QUITTANCE) & DÉPENSES CONNEXES
-- À exécuter après migration_date_expiration.sql.
--
-- Deux volets réunis dans un même module, disponible pour TOUS les
-- secteurs d'activité (universel, comme Vente/Clients/Factures) :
--   1. Personnel : fiche employé + paiements (salaire, prime, avance),
--      chaque paiement génère une quittance numérotée (le PDF est
--      généré côté client avec jsPDF, comme les factures)
--   2. Dépenses : petites dépenses de fonctionnement (loyer, électricité,
--      transport...), pour donner au gérant une vision globale des
--      sorties d'argent de l'entreprise, au-delà des seuls achats
--      fournisseurs
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EMPLOYÉS
-- Distinct des `utilisateurs` (comptes de connexion à l'app) : un
-- employé payé (livreur, manutentionnaire, ménage...) n'a pas forcément
-- besoin d'un compte pour se connecter à Akweo.
-- ---------------------------------------------------------------------
create table if not exists employes (
    id              uuid primary key default gen_random_uuid(),
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    nom             text not null,
    poste           text,
    telephone       text,
    salaire_reference numeric(12,2),
    actif           boolean not null default true,
    created_at      timestamptz not null default now()
);

create index if not exists idx_employes_entreprise on employes(entreprise_id);

-- ---------------------------------------------------------------------
-- 2. PAIEMENTS PERSONNEL
-- Chaque paiement reçoit un numéro de quittance unique par entreprise,
-- généré atomiquement par la fonction RPC ci-dessous.
-- ---------------------------------------------------------------------
create table if not exists paiements_personnel (
    id                  uuid primary key default gen_random_uuid(),
    entreprise_id       uuid not null references entreprises(id) on delete cascade,
    employe_id          uuid not null references employes(id) on delete restrict,
    numero_quittance    text not null,
    montant             numeric(12,2) not null check (montant > 0),
    periode             text, -- ex: "Septembre 2026", libre, optionnel
    motif               text not null default 'salaire'
                        check (motif in ('salaire', 'prime', 'avance', 'autre')),
    mode_paiement       text not null default 'especes'
                        check (mode_paiement in ('especes', 'mobile_money', 'virement')),
    utilisateur_id      uuid references utilisateurs(id),
    created_at          timestamptz not null default now(),
    unique (entreprise_id, numero_quittance)
);

create index if not exists idx_paiements_personnel_entreprise on paiements_personnel(entreprise_id);
create index if not exists idx_paiements_personnel_employe on paiements_personnel(employe_id);

-- ---------------------------------------------------------------------
-- 3. DÉPENSES CONNEXES
-- ---------------------------------------------------------------------
create table if not exists depenses (
    id              uuid primary key default gen_random_uuid(),
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    categorie       text not null default 'autre'
                    check (categorie in
                        ('loyer', 'electricite', 'eau', 'transport', 'fournitures',
                         'entretien', 'communication', 'autre')),
    description     text,
    montant         numeric(12,2) not null check (montant > 0),
    mode_paiement   text not null default 'especes'
                    check (mode_paiement in ('especes', 'mobile_money', 'virement')),
    utilisateur_id  uuid references utilisateurs(id),
    created_at      timestamptz not null default now()
);

create index if not exists idx_depenses_entreprise on depenses(entreprise_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table employes enable row level security;
alter table paiements_personnel enable row level security;
alter table depenses enable row level security;

create policy "isolation_par_entreprise_employes"
    on employes for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

create policy "isolation_par_entreprise_paiements_personnel"
    on paiements_personnel for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

create policy "isolation_par_entreprise_depenses"
    on depenses for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- =====================================================================
-- FONCTION RPC : enregistrer_paiement_personnel
-- Enregistre un paiement à un employé avec un numéro de quittance
-- généré atomiquement (format Q-YYYYMMDD-0001, par entreprise et par
-- jour). Retourne l'id du paiement créé ; le service TypeScript relit
-- la ligne pour obtenir numero_quittance et générer le PDF.
-- =====================================================================
create or replace function enregistrer_paiement_personnel(
    p_entreprise_id     uuid,
    p_employe_id        uuid,
    p_montant           numeric,
    p_periode           text,
    p_motif             text,
    p_mode_paiement     text,
    p_utilisateur_id    uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_paiement_id       uuid;
    v_numero_quittance  text;
begin
    select 'Q-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
    into v_numero_quittance
    from paiements_personnel
    where entreprise_id = p_entreprise_id
      and created_at::date = current_date;

    insert into paiements_personnel (
        entreprise_id, employe_id, numero_quittance, montant,
        periode, motif, mode_paiement, utilisateur_id
    )
    values (
        p_entreprise_id, p_employe_id, v_numero_quittance, p_montant,
        p_periode, coalesce(p_motif, 'salaire'), coalesce(p_mode_paiement, 'especes'), p_utilisateur_id
    )
    returning id into v_paiement_id;

    return v_paiement_id;
end;
$$;
