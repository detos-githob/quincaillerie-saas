-- =====================================================================
-- MIGRATION : GESTION DES ABONNEMENTS
-- À exécuter après migration_phase2.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PÉRIODICITÉ D'ABONNEMENT
-- plan_abonnement (déjà existant) reste le PALIER (essai/starter/pro).
-- periodicite_abonnement est un attribut séparé : mensuel ou annuel.
-- ---------------------------------------------------------------------
alter table entreprises
    add column if not exists periodicite_abonnement text
    check (periodicite_abonnement in ('mensuel', 'annuel'))
    default 'mensuel';

-- ---------------------------------------------------------------------
-- 2. SUPER ADMINISTRATEURS (toi, en tant qu'éditeur du SaaS)
-- Table séparée du modèle multi-tenant : un super admin n'appartient
-- à aucune entreprise cliente en particulier (même s'il peut aussi,
-- comme dans ton cas, être gérant de sa propre quincaillerie).
-- ---------------------------------------------------------------------
create table if not exists super_admins (
    auth_user_id uuid primary key references auth.users(id) on delete cascade,
    created_at   timestamptz not null default now()
);

alter table super_admins enable row level security;

create policy "un_super_admin_se_voit_lui_meme"
    on super_admins
    for select
    using (auth_user_id = auth.uid());

-- Ajoute-toi comme super admin (remplace l'email par le tien) :
insert into super_admins (auth_user_id)
select id from auth.users where email = 'jerbtos@gmail.com'
on conflict (auth_user_id) do nothing;

-- ---------------------------------------------------------------------
-- 3. FONCTIONS RPC POUR L'ESPACE ADMIN
-- ---------------------------------------------------------------------
create or replace function est_super_admin()
returns boolean
language sql
security definer
stable
as $$
    select exists (select 1 from super_admins where auth_user_id = auth.uid());
$$;

create or replace function lister_entreprises_admin()
returns setof entreprises
language plpgsql
security definer
as $$
begin
    if not est_super_admin() then
        raise exception 'Accès réservé aux administrateurs.';
    end if;
    return query select * from entreprises order by created_at desc;
end;
$$;

create or replace function modifier_abonnement_entreprise(
    p_entreprise_id  uuid,
    p_plan           text,
    p_periodicite    text,
    p_date_expiration date,
    p_actif          boolean
)
returns void
language plpgsql
security definer
as $$
begin
    if not est_super_admin() then
        raise exception 'Accès réservé aux administrateurs.';
    end if;

    update entreprises
        set plan_abonnement = p_plan,
            periodicite_abonnement = p_periodicite,
            date_expiration_abonnement = p_date_expiration,
            actif = p_actif
        where id = p_entreprise_id;
end;
$$;
