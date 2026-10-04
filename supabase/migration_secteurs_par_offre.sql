-- =====================================================================
-- MIGRATION : NOMBRE D'ACTIVITÉS (SECTEURS) SELON L'OFFRE
-- À exécuter après migration_offres_promotions.sql.
--
-- Chaque offre fixe le nombre d'activités qu'un commerce peut exploiter
-- en même temps (quincaillerie, dépôt de boissons, alimentation générale,
-- pièces détachées), activité principale comprise. Réglable par le super
-- admin dans « Offres et tarifs » ; appliqué par le serveur.
-- =====================================================================

alter table offres add column if not exists max_secteurs integer not null default 1
    check (max_secteurs between 1 and 5);

-- Valeurs de départ : 1 activité en essai et Starter, 3 en Business et Pro.
update offres set max_secteurs = 3 where id in ('business', 'pro') and max_secteurs = 1;

-- Contrôle serveur : on ne peut pas ACTIVER plus d'activités que l'offre
-- n'en permet. Réduire reste toujours possible (commerce passé d'une
-- offre supérieure à une offre inférieure).
create or replace function verifier_secteurs_selon_offre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_max     integer;
    v_offre   text;
    v_nouveau integer := coalesce(array_length(new.secteurs_actifs, 1), 0);
    v_ancien  integer := coalesce(array_length(old.secteurs_actifs, 1), 0);
begin
    -- Opérations serveur (service_role) et super admin : pas de limite.
    if auth.uid() is null or est_super_admin() then
        return new;
    end if;
    if new.secteurs_actifs is not distinct from old.secteurs_actifs then
        return new;
    end if;
    select o.max_secteurs, o.nom into v_max, v_offre from offres o where o.id = new.plan_abonnement;
    v_max := coalesce(v_max, 5);
    if v_nouveau > v_max and v_nouveau > v_ancien then
        raise exception 'Ton offre % permet % activité(s) au maximum.', coalesce(v_offre, new.plan_abonnement), v_max
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_secteurs_selon_offre on entreprises;
create trigger trg_secteurs_selon_offre
    before update of secteurs_actifs on entreprises
    for each row execute function verifier_secteurs_selon_offre();

revoke all on function verifier_secteurs_selon_offre() from public, anon, authenticated;

-- Fonction d'enregistrement des offres (super admin) : ajoute le réglage
-- max_secteurs.
create or replace function admin_enregistrer_offre(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id text := lower(btrim(coalesce(p->>'id', '')));
    v_existe boolean;
    v_avantages text[];
    v_modules text[];
begin
    perform exiger_super_admin();
    if v_id !~ '^[a-z0-9_]{2,30}$' then
        raise exception 'Identifiant invalide : 2 à 30 caractères, lettres minuscules, chiffres ou _.';
    end if;
    select array(select btrim(x) from jsonb_array_elements_text(coalesce(p->'avantages', '[]')) x where btrim(x) <> '')
        into v_avantages;
    select array(select x from jsonb_array_elements_text(coalesce(p->'modules', '[]')) x) into v_modules;
    if not (v_modules <@ array['fournisseurs','depot_boissons','depenses','tableau_decisionnel']) then
        raise exception 'Module inconnu dans la liste.';
    end if;
    if char_length(btrim(coalesce(p->>'nom', ''))) < 2 then
        raise exception 'Le nom de l''offre est obligatoire.';
    end if;
    select exists (select 1 from offres where id = v_id) into v_existe;

    if coalesce((p->>'recommandee')::boolean, false) then
        update offres set recommandee = false where id <> v_id;
    end if;

    if v_existe then
        update offres set
            nom = btrim(p->>'nom'),
            description = coalesce(btrim(p->>'description'), ''),
            prix_mensuel = coalesce((p->>'prix_mensuel')::numeric, 0),
            prix_annuel = coalesce((p->>'prix_annuel')::numeric, 0),
            max_utilisateurs = coalesce((p->>'max_utilisateurs')::integer, 2),
            max_secteurs = coalesce((p->>'max_secteurs')::integer, max_secteurs),
            modules = v_modules,
            avantages = v_avantages,
            duree_essai_jours = case when est_essai then coalesce((p->>'duree_essai_jours')::integer, 7) else null end,
            publique = case when est_essai then false else coalesce((p->>'publique')::boolean, true) end,
            recommandee = case when est_essai then false else coalesce((p->>'recommandee')::boolean, false) end,
            active = case when est_essai then true else coalesce((p->>'active')::boolean, true) end,
            ordre = coalesce((p->>'ordre')::integer, ordre),
            updated_at = now()
        where id = v_id;
    else
        insert into offres (id, nom, description, prix_mensuel, prix_annuel, max_utilisateurs, max_secteurs, modules, avantages,
                            publique, recommandee, active, ordre)
        values (v_id, btrim(p->>'nom'), coalesce(btrim(p->>'description'), ''),
                coalesce((p->>'prix_mensuel')::numeric, 0), coalesce((p->>'prix_annuel')::numeric, 0),
                coalesce((p->>'max_utilisateurs')::integer, 2), coalesce((p->>'max_secteurs')::integer, 1),
                v_modules, v_avantages,
                coalesce((p->>'publique')::boolean, true), coalesce((p->>'recommandee')::boolean, false),
                coalesce((p->>'active')::boolean, true),
                coalesce((p->>'ordre')::integer, (select coalesce(max(ordre), 0) + 1 from offres where ordre < 99)));
    end if;

    if exists (select 1 from offres where id = v_id and publique and active and not est_essai
               and (prix_mensuel <= 0 or prix_annuel <= 0)) then
        raise exception 'Une offre proposée à la vente doit avoir un prix mensuel et annuel supérieurs à zéro.';
    end if;
    return v_id;
end;
$$;
