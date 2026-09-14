-- =====================================================================
-- MIGRATION : DÉPÔT DE BOISSONS (casiers, consignes, casse)
-- À exécuter après migration_fournisseurs_gros_livraison.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ARTICLES : montant de consigne + stock de casiers vides
-- articles.stock_actuel reste le stock de casiers PLEINS (comme pour
-- n'importe quel article). stock_vides est un compteur séparé pour les
-- casiers vides détenus par le dépôt.
-- ---------------------------------------------------------------------
alter table articles
    add column if not exists montant_consigne numeric(12,2) default 0,
    add column if not exists stock_vides numeric(12,2) not null default 0;

-- ---------------------------------------------------------------------
-- 2. CONSIGNES EN COURS
-- Une ligne = des casiers pleins sortis chez un client SANS que les
-- vides correspondants aient été rendus. Soldée dès que le client
-- rend les vides (totalement ou partiellement, en plusieurs fois).
-- ---------------------------------------------------------------------
create table if not exists consignes (
    id               uuid primary key default gen_random_uuid(),
    entreprise_id    uuid not null references entreprises(id) on delete cascade,
    client_id        uuid references clients(id) on delete set null,
    vente_id         uuid references ventes(id) on delete set null,
    article_id       uuid not null references articles(id),
    quantite         numeric(12,2) not null,       -- quantité initiale consignée
    quantite_rendue  numeric(12,2) not null default 0,
    montant_unitaire numeric(12,2) not null,
    statut           text not null default 'en_cours'
                     check (statut in ('en_cours', 'soldee')),
    created_at       timestamptz not null default now(),
    solde_le         timestamptz
);

create index if not exists idx_consignes_entreprise on consignes(entreprise_id);
create index if not exists idx_consignes_client on consignes(entreprise_id, client_id, statut);

alter table consignes enable row level security;

create policy "isolation_par_entreprise_consignes"
    on consignes
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- ---------------------------------------------------------------------
-- 3. CASSES (bris de casiers/bouteilles)
-- ---------------------------------------------------------------------
create table if not exists casses (
    id             uuid primary key default gen_random_uuid(),
    entreprise_id  uuid not null references entreprises(id) on delete cascade,
    article_id     uuid not null references articles(id),
    quantite       numeric(12,2) not null,
    motif          text,
    utilisateur_id uuid references utilisateurs(id),
    created_at     timestamptz not null default now()
);

create index if not exists idx_casses_entreprise on casses(entreprise_id);

alter table casses enable row level security;

create policy "isolation_par_entreprise_casses"
    on casses
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- Ajout du motif 'casse' aux mouvements de stock possibles.
alter table mouvements_stock drop constraint if exists mouvements_stock_type_mouvement_check;
alter table mouvements_stock add constraint mouvements_stock_type_mouvement_check
    check (type_mouvement in
        ('entree', 'sortie_vente', 'ajustement_inventaire', 'correction_manuelle', 'casse'));

-- ---------------------------------------------------------------------
-- 4. creer_vente — version avec gestion de la consigne
-- p_consignes : casiers pleins vendus sans reprise de vide en face
--   [{article_id, quantite, montant_unitaire}]
-- p_casiers_vides_recus : vides rendus par le client à cette vente
--   (règle les consignes ouvertes les plus anciennes en premier)
--   [{article_id, quantite}]
-- ---------------------------------------------------------------------
drop function if exists creer_vente(uuid, uuid, uuid, text, jsonb, text, text, jsonb);

create or replace function creer_vente(
    p_entreprise_id  uuid,
    p_client_id      uuid,
    p_utilisateur_id uuid,
    p_mode_paiement  text,
    p_lignes         jsonb,
    p_type_facture   text default 'simple',
    p_type_vente     text default 'detail',
    p_livraison      jsonb default null,
    p_consignes      jsonb default null,
    p_casiers_vides_recus jsonb default null
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_vente_id        uuid;
    v_numero_vente    text;
    v_total           numeric := 0;
    v_ligne           jsonb;
    v_article_id      uuid;
    v_quantite        numeric;
    v_prix_unitaire   numeric;
    v_prix_achat      numeric;
    v_remise          numeric;
    v_montant_ligne   numeric;
    v_stock_avant     numeric;
    v_stock_apres     numeric;
    v_statut_emecef   text;
    v_montant_consignes numeric := 0;
    v_a_rendre        numeric;
    v_consigne_ouverte record;
    v_a_solder        numeric;
begin
    if p_type_facture not in ('simple', 'normalisee') then
        p_type_facture := 'simple';
    end if;
    if p_type_vente not in ('detail', 'demi_gros', 'gros') then
        p_type_vente := 'detail';
    end if;

    select 'V-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
    into v_numero_vente
    from ventes
    where entreprise_id = p_entreprise_id
      and created_at::date = current_date;

    for v_ligne in select * from jsonb_array_elements(p_lignes)
    loop
        v_total := v_total
            + (v_ligne->>'quantite')::numeric * (v_ligne->>'prix_unitaire')::numeric
            - coalesce((v_ligne->>'remise')::numeric, 0);
    end loop;

    -- Le montant des nouvelles consignes s'ajoute au total à payer.
    if p_consignes is not null then
        for v_ligne in select * from jsonb_array_elements(p_consignes)
        loop
            v_montant_consignes := v_montant_consignes
                + (v_ligne->>'quantite')::numeric * (v_ligne->>'montant_unitaire')::numeric;
        end loop;
    end if;
    v_total := v_total + v_montant_consignes;

    insert into ventes (
        entreprise_id, numero_vente, client_id, utilisateur_id,
        montant_total, montant_paye, mode_paiement, statut, type_vente
    )
    values (
        p_entreprise_id, v_numero_vente, p_client_id, p_utilisateur_id,
        v_total,
        case when p_mode_paiement = 'credit' then 0 else v_total end,
        p_mode_paiement,
        case when p_mode_paiement = 'credit' then 'creance' else 'payee' end,
        p_type_vente
    )
    returning id into v_vente_id;

    for v_ligne in select * from jsonb_array_elements(p_lignes)
    loop
        v_article_id    := (v_ligne->>'article_id')::uuid;
        v_quantite      := (v_ligne->>'quantite')::numeric;
        v_prix_unitaire := (v_ligne->>'prix_unitaire')::numeric;
        v_prix_achat    := (v_ligne->>'prix_achat_unitaire')::numeric;
        v_remise        := coalesce((v_ligne->>'remise')::numeric, 0);
        v_montant_ligne := v_quantite * v_prix_unitaire - v_remise;

        insert into lignes_vente (
            vente_id, article_id, quantite, prix_unitaire,
            prix_achat_unitaire, remise, montant_ligne
        )
        values (
            v_vente_id, v_article_id, v_quantite, v_prix_unitaire,
            v_prix_achat, v_remise, v_montant_ligne
        );

        select stock_actuel into v_stock_avant from articles where id = v_article_id;
        v_stock_apres := v_stock_avant - v_quantite;

        insert into mouvements_stock (
            entreprise_id, article_id, type_mouvement,
            quantite, quantite_avant, quantite_apres,
            reference_document, utilisateur_id
        )
        values (
            p_entreprise_id, v_article_id, 'sortie_vente',
            -v_quantite, v_stock_avant, v_stock_apres,
            v_vente_id, p_utilisateur_id
        );

        update articles
            set stock_actuel = v_stock_apres, updated_at = now()
            where id = v_article_id;
    end loop;

    if p_mode_paiement = 'credit' and p_client_id is not null then
        update clients set solde_credit = solde_credit + v_total
            where id = p_client_id;
    end if;

    -- Nouvelles consignes (casiers pleins sortis sans vide en échange).
    if p_consignes is not null then
        for v_ligne in select * from jsonb_array_elements(p_consignes)
        loop
            insert into consignes (
                entreprise_id, client_id, vente_id, article_id,
                quantite, montant_unitaire
            )
            values (
                p_entreprise_id, p_client_id, v_vente_id,
                (v_ligne->>'article_id')::uuid,
                (v_ligne->>'quantite')::numeric,
                (v_ligne->>'montant_unitaire')::numeric
            );
        end loop;
    end if;

    -- Vides rendus à cette vente : incrémente le stock de vides et
    -- solde les consignes ouvertes les plus anciennes en premier
    -- (FIFO), pour ce client et cet article.
    if p_casiers_vides_recus is not null then
        for v_ligne in select * from jsonb_array_elements(p_casiers_vides_recus)
        loop
            v_article_id := (v_ligne->>'article_id')::uuid;
            v_quantite   := (v_ligne->>'quantite')::numeric;
            v_a_rendre   := v_quantite;

            update articles set stock_vides = stock_vides + v_quantite
                where id = v_article_id;

            if p_client_id is not null then
                for v_consigne_ouverte in
                    select * from consignes
                    where entreprise_id = p_entreprise_id
                      and client_id = p_client_id
                      and article_id = v_article_id
                      and statut = 'en_cours'
                    order by created_at asc
                loop
                    exit when v_a_rendre <= 0;
                    v_a_solder := least(v_a_rendre, v_consigne_ouverte.quantite - v_consigne_ouverte.quantite_rendue);

                    update consignes
                        set quantite_rendue = quantite_rendue + v_a_solder,
                            statut = case
                                when quantite_rendue + v_a_solder >= quantite then 'soldee'
                                else 'en_cours'
                            end,
                            solde_le = case
                                when quantite_rendue + v_a_solder >= quantite then now()
                                else solde_le
                            end
                        where id = v_consigne_ouverte.id;

                    v_a_rendre := v_a_rendre - v_a_solder;
                end loop;
            end if;
        end loop;
    end if;

    v_statut_emecef := case when p_type_facture = 'normalisee' then 'en_attente' else 'non_applicable' end;

    insert into factures (entreprise_id, vente_id, type_facture, numero_facture, statut_emecef)
    values (
        p_entreprise_id, v_vente_id, p_type_facture,
        (case when p_type_facture = 'normalisee' then 'FN-' else 'F-' end) || v_numero_vente,
        v_statut_emecef
    );

    if p_livraison is not null then
        insert into livraisons (entreprise_id, vente_id, client_id, adresse_livraison, date_prevue)
        values (
            p_entreprise_id, v_vente_id, p_client_id,
            p_livraison->>'adresse',
            nullif(p_livraison->>'date_prevue', '')::date
        );
    end if;

    return v_vente_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Solde manuel d'une consigne (le client revient juste rendre des
-- vides, sans nouvel achat).
-- ---------------------------------------------------------------------
create or replace function solder_consigne_manuelle(
    p_consigne_id uuid,
    p_quantite    numeric
)
returns void
language plpgsql
security definer
as $$
declare
    v_consigne record;
begin
    select * into v_consigne from consignes where id = p_consigne_id;
    if v_consigne is null then
        raise exception 'Consigne introuvable.';
    end if;
    if entreprise_de_l_utilisateur_connecte() <> v_consigne.entreprise_id then
        raise exception 'Accès refusé.';
    end if;

    update articles set stock_vides = stock_vides + p_quantite
        where id = v_consigne.article_id;

    update consignes
        set quantite_rendue = quantite_rendue + p_quantite,
            statut = case when quantite_rendue + p_quantite >= quantite then 'soldee' else 'en_cours' end,
            solde_le = case when quantite_rendue + p_quantite >= quantite then now() else solde_le end
        where id = p_consigne_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Enregistrement d'une casse (sortie de stock, casiers pleins)
-- ---------------------------------------------------------------------
create or replace function enregistrer_casse(
    p_entreprise_id  uuid,
    p_article_id     uuid,
    p_quantite       numeric,
    p_motif          text,
    p_utilisateur_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
    v_stock_avant numeric;
    v_stock_apres numeric;
begin
    select stock_actuel into v_stock_avant from articles where id = p_article_id;
    v_stock_apres := v_stock_avant - p_quantite;

    insert into mouvements_stock (
        entreprise_id, article_id, type_mouvement,
        quantite, quantite_avant, quantite_apres,
        motif, utilisateur_id
    )
    values (
        p_entreprise_id, p_article_id, 'casse',
        -p_quantite, v_stock_avant, v_stock_apres,
        coalesce(p_motif, 'Casse'), p_utilisateur_id
    );

    insert into casses (entreprise_id, article_id, quantite, motif, utilisateur_id)
    values (p_entreprise_id, p_article_id, p_quantite, p_motif, p_utilisateur_id);

    update articles
        set stock_actuel = v_stock_apres, updated_at = now()
        where id = p_article_id;
end;
$$;
