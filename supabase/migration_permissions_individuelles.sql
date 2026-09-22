-- =====================================================================
-- MIGRATION : PERMISSIONS INDIVIDUELLES PAR MEMBRE D'ÉQUIPE
-- À exécuter après migration_dashboard_decisionnel.sql.
--
-- Jusqu'ici, l'accès aux modules dépendait UNIQUEMENT du rôle
-- (gérant/comptable/magasinier/vendeur), figé dans le code. Cette
-- migration permet au gérant d'ajuster, pour chaque membre de son
-- équipe et pour chaque module, un niveau d'accès parmi :
--   - 'aucun'     : le module n'apparaît pas, route bloquée
--   - 'lecture'    : consultation seule, actions de création/modification
--                    masquées
--   - 'ecriture'   : accès complet (comportement du rôle par défaut)
-- En l'absence d'une ligne explicite pour un (utilisateur, module), le
-- niveau par défaut du rôle s'applique (voir src/lib/permissions.ts).
-- Le gérant lui-même n'est jamais concerné : toujours accès complet.
-- =====================================================================

create table if not exists permissions_utilisateur (
    id              uuid primary key default gen_random_uuid(),
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    utilisateur_id  uuid not null references utilisateurs(id) on delete cascade,
    module          text not null,
    niveau          text not null check (niveau in ('aucun', 'lecture', 'ecriture')),
    modifie_par      uuid references utilisateurs(id),
    updated_at      timestamptz not null default now(),
    unique (utilisateur_id, module)
);

create index if not exists idx_permissions_utilisateur_entreprise on permissions_utilisateur(entreprise_id);
create index if not exists idx_permissions_utilisateur_utilisateur on permissions_utilisateur(utilisateur_id);

alter table permissions_utilisateur enable row level security;

-- Tout le monde dans l'entreprise peut LIRE les permissions (nécessaire
-- pour que chaque utilisateur résolve ses propres accès au chargement
-- de l'app), mais seul un gérant de la même entreprise peut les écrire.
create policy "lecture_permissions_par_entreprise"
    on permissions_utilisateur for select
    using (entreprise_id = entreprise_de_l_utilisateur_connecte());

create policy "ecriture_permissions_par_gerant"
    on permissions_utilisateur for all
    using (
        entreprise_id = entreprise_de_l_utilisateur_connecte()
        and exists (
            select 1 from utilisateurs u
            where u.auth_user_id = auth.uid() and u.role = 'gerant'
        )
    )
    with check (
        entreprise_id = entreprise_de_l_utilisateur_connecte()
        and exists (
            select 1 from utilisateurs u
            where u.auth_user_id = auth.uid() and u.role = 'gerant'
        )
    );

-- =====================================================================
-- FONCTION RPC : definir_permissions_utilisateur
-- Remplace en une fois TOUTES les permissions explicites d'un membre
-- (upsert du snapshot complet envoyé par le formulaire de gestion des
-- accès). Un module absent de p_permissions retombe sur le défaut du
-- rôle (aucune ligne conservée pour lui). Refuse si l'appelant n'est
-- pas gérant, ou si la cible est elle-même gérante (le rôle gérant
-- n'est jamais restreignable).
-- =====================================================================
create or replace function definir_permissions_utilisateur(
    p_entreprise_id     uuid,
    p_utilisateur_id    uuid,
    p_permissions       jsonb -- [{module, niveau}]
)
returns void
language plpgsql
security definer
as $$
declare
    v_uid           uuid := auth.uid();
    v_role_appelant text;
    v_role_cible    text;
    v_ligne         jsonb;
begin
    select role into v_role_appelant from utilisateurs where auth_user_id = v_uid;
    if v_role_appelant is distinct from 'gerant' then
        raise exception 'Seul un gérant peut modifier les accès de l''équipe.';
    end if;

    select role into v_role_cible
    from utilisateurs where id = p_utilisateur_id and entreprise_id = p_entreprise_id;

    if v_role_cible is null then
        raise exception 'Membre introuvable.';
    end if;
    if v_role_cible = 'gerant' then
        raise exception 'Le rôle gérant a toujours accès à tout : rien à restreindre.';
    end if;

    delete from permissions_utilisateur
        where utilisateur_id = p_utilisateur_id and entreprise_id = p_entreprise_id;

    for v_ligne in select * from jsonb_array_elements(p_permissions)
    loop
        insert into permissions_utilisateur (entreprise_id, utilisateur_id, module, niveau, modifie_par)
        values (
            p_entreprise_id, p_utilisateur_id,
            v_ligne->>'module', v_ligne->>'niveau',
            (select id from utilisateurs where auth_user_id = v_uid)
        );
    end loop;
end;
$$;
