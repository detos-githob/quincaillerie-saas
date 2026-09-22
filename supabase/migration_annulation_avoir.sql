-- =====================================================================
-- MIGRATION : ANNULATION / AVOIR DE VENTE
-- À exécuter après migration_ledger_creances.sql (utilise
-- enregistrer_mouvement_creance).
--
-- Un avoir peut porter sur tout ou partie des lignes d'une vente
-- (retour partiel possible). Chaque avoir :
--   - remet la quantité retournée en stock (traçée dans mouvements_stock)
--   - réduit la créance du client dans le ledger SI la vente était à
--     crédit (une vente payée cash/mobile money ne touche pas le
--     ledger : le remboursement se fait en espèces, hors app)
--   - referme automatiquement la vente (statut "annulee") si la totalité
--     de ses lignes a fini par être retournée, cumul de tous ses avoirs
--     confondus
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. AVOIRS (en-tête)
-- ---------------------------------------------------------------------
create table if not exists avoirs (
    id              uuid primary key default gen_random_uuid(),
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    vente_id        uuid not null references ventes(id) on delete restrict,
    numero_avoir    text not null,
    motif           text not null,
    montant_total   numeric(12,2) not null,
    utilisateur_id  uuid references utilisateurs(id),
    created_at      timestamptz not null default now(),
    unique (entreprise_id, numero_avoir)
);

create index if not exists idx_avoirs_entreprise on avoirs(entreprise_id);
create index if not exists idx_avoirs_vente on avoirs(vente_id);

-- ---------------------------------------------------------------------
-- 2. LIGNES D'AVOIR
-- ---------------------------------------------------------------------
create table if not exists lignes_avoir (
    id              uuid primary key default gen_random_uuid(),
    avoir_id        uuid not null references avoirs(id) on delete cascade,
    ligne_vente_id  uuid not null references lignes_vente(id) on delete restrict,
    article_id      uuid not null references articles(id),
    quantite        numeric(12,2) not null check (quantite > 0),
    prix_unitaire   numeric(12,2) not null,
    montant_ligne   numeric(12,2) not null
);

create index if not exists idx_lignes_avoir_avoir on lignes_avoir(avoir_id);
create index if not exists idx_lignes_avoir_ligne_vente on lignes_avoir(ligne_vente_id);

-- Complète la FK laissée en attente dans migration_ledger_creances.sql
-- (la table avoirs n'existait pas encore à ce moment-là).
alter table mouvements_creance drop constraint if exists mouvements_creance_reference_avoir_id_fkey;
alter table mouvements_creance add constraint mouvements_creance_reference_avoir_id_fkey
    foreign key (reference_avoir_id) references avoirs(id) on delete set null;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table avoirs enable row level security;
alter table lignes_avoir enable row level security;

create policy "isolation_par_entreprise_avoirs"
    on avoirs for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

create policy "isolation_par_entreprise_lignes_avoir"
    on lignes_avoir for all
    using (avoir_id in (select id from avoirs where entreprise_id = entreprise_de_l_utilisateur_connecte()))
    with check (avoir_id in (select id from avoirs where entreprise_id = entreprise_de_l_utilisateur_connecte()));

-- =====================================================================
-- FONCTION RPC : creer_avoir_vente
-- Atomique : valide les quantités retournables, remet en stock, réduit
-- la créance si la vente était à crédit, referme la vente si tout a
-- été retourné. p_lignes : [{ligne_vente_id, quantite}]
-- =====================================================================
create or replace function creer_avoir_vente(
    p_vente_id          uuid,
    p_entreprise_id     uuid,
    p_motif             text,
    p_lignes            jsonb,
    p_utilisateur_id    uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_client_id             uuid;
    v_mode_paiement         text;
    v_statut_vente          text;
    v_numero_avoir          text;
    v_avoir_id              uuid;
    v_ligne                 jsonb;
    v_ligne_vente_id        uuid;
    v_quantite_demandee     numeric;
    v_article_id            uuid;
    v_prix_unitaire         numeric;
    v_quantite_originale    numeric;
    v_deja_retournee        numeric;
    v_montant_total_avoir   numeric := 0;
    v_montant_ligne         numeric;
    v_stock_avant           numeric;
    v_stock_apres           numeric;
    v_total_lignes_vente    numeric;
    v_total_retourne_apres  numeric;
begin
    select client_id, mode_paiement, statut into v_client_id, v_mode_paiement, v_statut_vente
    from ventes where id = p_vente_id and entreprise_id = p_entreprise_id;

    if v_statut_vente is null then
        raise exception 'Vente introuvable.';
    end if;

    if v_statut_vente = 'annulee' then
        raise exception 'Cette vente est déjà entièrement annulée.';
    end if;

    if jsonb_array_length(p_lignes) = 0 then
        raise exception 'Sélectionne au moins une ligne à retourner.';
    end if;

    select 'AV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
    into v_numero_avoir
    from avoirs
    where entreprise_id = p_entreprise_id
      and created_at::date = current_date;

    insert into avoirs (entreprise_id, vente_id, numero_avoir, motif, montant_total, utilisateur_id)
    values (p_entreprise_id, p_vente_id, v_numero_avoir, p_motif, 0, p_utilisateur_id)
    returning id into v_avoir_id;

    for v_ligne in select * from jsonb_array_elements(p_lignes)
    loop
        v_ligne_vente_id    := (v_ligne->>'ligne_vente_id')::uuid;
        v_quantite_demandee := (v_ligne->>'quantite')::numeric;

        if v_quantite_demandee <= 0 then
            continue;
        end if;

        select lv.article_id, lv.prix_unitaire, lv.quantite
        into v_article_id, v_prix_unitaire, v_quantite_originale
        from lignes_vente lv
        where lv.id = v_ligne_vente_id and lv.vente_id = p_vente_id;

        if v_article_id is null then
            raise exception 'Ligne de vente introuvable.';
        end if;

        select coalesce(sum(la.quantite), 0) into v_deja_retournee
        from lignes_avoir la
        join avoirs a on a.id = la.avoir_id
        where la.ligne_vente_id = v_ligne_vente_id;

        if v_deja_retournee + v_quantite_demandee > v_quantite_originale then
            raise exception
                'Quantité retournée (%) dépasse ce qui peut encore l''être pour cette ligne (reste %).',
                v_quantite_demandee, v_quantite_originale - v_deja_retournee;
        end if;

        v_montant_ligne := v_quantite_demandee * v_prix_unitaire;
        v_montant_total_avoir := v_montant_total_avoir + v_montant_ligne;

        insert into lignes_avoir (avoir_id, ligne_vente_id, article_id, quantite, prix_unitaire, montant_ligne)
        values (v_avoir_id, v_ligne_vente_id, v_article_id, v_quantite_demandee, v_prix_unitaire, v_montant_ligne);

        -- Remise en stock de la quantité retournée
        select stock_actuel into v_stock_avant from articles where id = v_article_id;
        v_stock_apres := v_stock_avant + v_quantite_demandee;

        insert into mouvements_stock (
            entreprise_id, article_id, type_mouvement,
            quantite, quantite_avant, quantite_apres,
            motif, reference_document, utilisateur_id
        )
        values (
            p_entreprise_id, v_article_id, 'entree',
            v_quantite_demandee, v_stock_avant, v_stock_apres,
            'Retour vente (avoir ' || v_numero_avoir || ')', v_avoir_id, p_utilisateur_id
        );

        update articles set stock_actuel = v_stock_apres, updated_at = now() where id = v_article_id;
    end loop;

    if v_montant_total_avoir = 0 then
        raise exception 'Aucune quantité valide à retourner.';
    end if;

    update avoirs set montant_total = v_montant_total_avoir where id = v_avoir_id;

    -- Réduit la créance du client UNIQUEMENT si la vente était à crédit
    -- (une vente déjà payée cash/mobile money se rembourse hors app).
    if v_mode_paiement = 'credit' and v_client_id is not null then
        perform enregistrer_mouvement_creance(
            p_entreprise_id, v_client_id, 'avoir', -v_montant_total_avoir,
            p_vente_id, v_avoir_id, 'Avoir ' || v_numero_avoir, p_utilisateur_id
        );
    end if;

    -- Referme la vente si la totalité de ses lignes a été retournée
    -- (cumul de tous les avoirs émis sur cette vente, pas seulement
    -- celui-ci).
    select coalesce(sum(quantite), 0) into v_total_lignes_vente
    from lignes_vente where vente_id = p_vente_id;

    select coalesce(sum(la.quantite), 0) into v_total_retourne_apres
    from lignes_avoir la
    join avoirs a on a.id = la.avoir_id
    where a.vente_id = p_vente_id;

    if v_total_retourne_apres >= v_total_lignes_vente then
        update ventes set statut = 'annulee' where id = p_vente_id;
    end if;

    return v_avoir_id;
end;
$$;
