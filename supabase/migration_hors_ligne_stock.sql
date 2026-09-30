-- =====================================================================
-- MIGRATION : ENTRÉES / CORRECTIONS DE STOCK FIABLES ET HORS LIGNE (étape 3)
-- À exécuter après migration_hors_ligne_tontine.sql.
--
-- Défaut corrigé (présent même en ligne) : l'application calculait le
-- nouveau stock sur l'appareil (stock affiché + quantité) puis ÉCRASAIT
-- le stock du serveur avec ce chiffre. Une vente faite entre-temps sur un
-- autre appareil était effacée du stock, sans erreur. Hors ligne, une
-- entrée saisie le matin aurait effacé toutes les ventes de la journée.
--
-- Désormais le serveur applique une VARIATION (+20, -3) sur le stock
-- réel, sous le même verrou que les ventes, et chaque mouvement porte un
-- identifiant unique créé sur l'appareil (jamais compté deux fois).
-- =====================================================================

alter table mouvements_stock add column if not exists id_local    uuid;
alter table mouvements_stock add column if not exists appareil_id uuid;

create unique index if not exists uq_mouvements_stock_id_local
    on mouvements_stock(entreprise_id, id_local)
    where id_local is not null;

create or replace function synchroniser_mouvement_stock(
    p_id_local       uuid,
    p_date           timestamptz,
    p_appareil_id    uuid,
    p_entreprise_id  uuid,
    p_article_id     uuid,
    p_type           text,
    p_quantite       numeric,
    p_motif          text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u        uuid := verifier_acces_entreprise(p_entreprise_id);
    v_existant mouvements_stock%rowtype;
    v_avant    numeric;
    v_apres    numeric;
begin
    if p_id_local is null then
        raise exception 'Identifiant local manquant.';
    end if;
    if p_type not in ('entree', 'correction_manuelle') then
        raise exception 'Type de mouvement non autorisé : %', p_type;
    end if;
    if p_quantite is null or p_quantite = 0 then
        raise exception 'La quantité doit être différente de zéro.';
    end if;
    if p_type = 'entree' and p_quantite < 0 then
        raise exception 'Une entrée de stock doit être positive.';
    end if;
    perform verifier_reference('articles', p_article_id, p_entreprise_id);

    -- Même verrou que les ventes : stock toujours cohérent.
    perform pg_advisory_xact_lock(hashtext('vente_' || p_entreprise_id::text));

    select * into v_existant from mouvements_stock
    where entreprise_id = p_entreprise_id and id_local = p_id_local;
    if found then
        return jsonb_build_object('deja_recu', true, 'stock_apres',
            (select stock_actuel from articles where id = p_article_id));
    end if;

    select stock_actuel into v_avant from articles where id = p_article_id for update;
    v_apres := v_avant + p_quantite;

    insert into mouvements_stock (
        entreprise_id, article_id, type_mouvement, quantite, quantite_avant, quantite_apres,
        motif, utilisateur_id, id_local, appareil_id, created_at
    )
    values (
        p_entreprise_id, p_article_id, p_type, p_quantite, v_avant, v_apres,
        left(coalesce(nullif(btrim(p_motif), ''), case when p_type = 'entree' then 'Réapprovisionnement' else 'Correction manuelle' end), 200),
        v_u, p_id_local, p_appareil_id, least(coalesce(p_date, now()), now())
    );

    update articles set stock_actuel = v_apres, updated_at = now() where id = p_article_id;

    return jsonb_build_object('deja_recu', false, 'stock_avant', v_avant, 'stock_apres', v_apres);
end;
$$;

revoke all on function synchroniser_mouvement_stock(uuid, timestamptz, uuid, uuid, uuid, text, numeric, text) from public, anon;
grant execute on function synchroniser_mouvement_stock(uuid, timestamptz, uuid, uuid, uuid, text, numeric, text) to authenticated;
