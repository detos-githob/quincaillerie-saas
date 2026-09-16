-- =====================================================================
-- MIGRATION : TONTINE CLIENT (souscription, cotisations, panier)
-- À exécuter après migration_personnel_depenses.sql.
--
-- Disponible pour TOUS les secteurs d'activité (universel). Principe :
--   1. Un client souscrit à une tontine avec un plafond libre (le
--      montant qu'il veut atteindre)
--   2. Il verse des cotisations au fil du temps ; chacune génère un
--      reçu numéroté (PDF généré côté client, comme les factures)
--   3. Il peut, pendant ce temps, ajouter des articles à un panier privé
--      lié à sa tontine (ce qu'il compte récupérer une fois le plafond
--      atteint)
--   4. Dès que le cumul des cotisations atteint le plafond, la tontine
--      passe au statut "atteint" (le "compte passe au vert" côté app) :
--      le client peut alors récupérer les articles de son panier, ce
--      qui sort la marchandise du stock et clôture la tontine
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TONTINES (souscriptions)
-- ---------------------------------------------------------------------
create table if not exists tontines (
    id                  uuid primary key default gen_random_uuid(),
    entreprise_id       uuid not null references entreprises(id) on delete cascade,
    client_id           uuid not null references clients(id) on delete cascade,
    plafond             numeric(12,2) not null check (plafond > 0),
    montant_cumule      numeric(12,2) not null default 0,
    statut              text not null default 'en_cours'
                        check (statut in ('en_cours', 'atteint', 'cloturee')),
    date_debut          timestamptz not null default now(),
    date_atteinte       timestamptz,
    utilisateur_id      uuid references utilisateurs(id),
    created_at          timestamptz not null default now()
);

create index if not exists idx_tontines_entreprise on tontines(entreprise_id);
create index if not exists idx_tontines_client on tontines(client_id);

-- ---------------------------------------------------------------------
-- 2. COTISATIONS TONTINE
-- Chaque versement reçoit un numéro de reçu unique par entreprise,
-- généré atomiquement par la fonction RPC ci-dessous (même principe que
-- les quittances de paiement personnel).
-- ---------------------------------------------------------------------
create table if not exists cotisations_tontine (
    id                  uuid primary key default gen_random_uuid(),
    tontine_id          uuid not null references tontines(id) on delete cascade,
    entreprise_id       uuid not null references entreprises(id) on delete cascade,
    numero_recu         text not null,
    montant             numeric(12,2) not null check (montant > 0),
    mode_paiement       text not null default 'especes'
                        check (mode_paiement in ('especes', 'mobile_money')),
    utilisateur_id      uuid references utilisateurs(id),
    created_at          timestamptz not null default now(),
    unique (entreprise_id, numero_recu)
);

create index if not exists idx_cotisations_tontine_tontine on cotisations_tontine(tontine_id);

-- ---------------------------------------------------------------------
-- 3. PANIER TONTINE
-- Articles que le client compte récupérer une fois le plafond atteint.
-- Un même article ajouté deux fois cumule la quantité (voir RPC).
-- ---------------------------------------------------------------------
create table if not exists panier_tontine (
    id              uuid primary key default gen_random_uuid(),
    tontine_id      uuid not null references tontines(id) on delete cascade,
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    article_id      uuid not null references articles(id),
    quantite        numeric(12,2) not null check (quantite > 0),
    created_at      timestamptz not null default now(),
    unique (tontine_id, article_id)
);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table tontines enable row level security;
alter table cotisations_tontine enable row level security;
alter table panier_tontine enable row level security;

create policy "isolation_par_entreprise_tontines"
    on tontines for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

create policy "isolation_par_entreprise_cotisations_tontine"
    on cotisations_tontine for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

create policy "isolation_par_entreprise_panier_tontine"
    on panier_tontine for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- =====================================================================
-- FONCTION RPC : enregistrer_cotisation_tontine
-- Enregistre un versement, met à jour le cumul de la tontine et bascule
-- son statut sur "atteint" dès que le plafond est franchi. Atomique.
-- =====================================================================
create or replace function enregistrer_cotisation_tontine(
    p_tontine_id        uuid,
    p_entreprise_id     uuid,
    p_montant           numeric,
    p_mode_paiement     text,
    p_utilisateur_id    uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_cotisation_id     uuid;
    v_numero_recu       text;
    v_plafond           numeric;
    v_nouveau_cumule    numeric;
    v_statut_actuel     text;
begin
    select plafond, montant_cumule, statut into v_plafond, v_nouveau_cumule, v_statut_actuel
    from tontines where id = p_tontine_id and entreprise_id = p_entreprise_id;

    if v_plafond is null then
        raise exception 'Tontine introuvable.';
    end if;

    if v_statut_actuel = 'cloturee' then
        raise exception 'Cette tontine est déjà clôturée.';
    end if;

    select 'TR-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
    into v_numero_recu
    from cotisations_tontine
    where entreprise_id = p_entreprise_id
      and created_at::date = current_date;

    insert into cotisations_tontine (
        tontine_id, entreprise_id, numero_recu, montant, mode_paiement, utilisateur_id
    )
    values (
        p_tontine_id, p_entreprise_id, v_numero_recu, p_montant,
        coalesce(p_mode_paiement, 'especes'), p_utilisateur_id
    )
    returning id into v_cotisation_id;

    v_nouveau_cumule := v_nouveau_cumule + p_montant;

    update tontines
        set montant_cumule = v_nouveau_cumule,
            statut = case when v_nouveau_cumule >= v_plafond then 'atteint' else statut end,
            date_atteinte = case
                when v_nouveau_cumule >= v_plafond and date_atteinte is null then now()
                else date_atteinte
            end
        where id = p_tontine_id;

    return v_cotisation_id;
end;
$$;

-- =====================================================================
-- FONCTION RPC : ajouter_produit_panier_tontine
-- Ajoute un article au panier de la tontine, ou cumule la quantité s'il
-- y est déjà.
-- =====================================================================
create or replace function ajouter_produit_panier_tontine(
    p_tontine_id    uuid,
    p_entreprise_id uuid,
    p_article_id    uuid,
    p_quantite      numeric
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_ligne_id uuid;
begin
    insert into panier_tontine (tontine_id, entreprise_id, article_id, quantite)
    values (p_tontine_id, p_entreprise_id, p_article_id, p_quantite)
    on conflict (tontine_id, article_id)
    do update set quantite = panier_tontine.quantite + excluded.quantite
    returning id into v_ligne_id;

    return v_ligne_id;
end;
$$;

-- =====================================================================
-- FONCTION RPC : recuperer_produits_tontine
-- Une fois la tontine au statut "atteint", sort du stock tous les
-- articles du panier, vide le panier et clôture la tontine. Refuse si
-- le plafond n'est pas encore atteint, ou si la valeur du panier (au
-- prix de vente courant) dépasse le montant cumulé — garde-fou pour ne
-- jamais laisser un client repartir avec plus que ce qu'il a épargné.
-- =====================================================================
create or replace function recuperer_produits_tontine(
    p_tontine_id        uuid,
    p_entreprise_id     uuid,
    p_utilisateur_id    uuid
)
returns void
language plpgsql
security definer
as $$
declare
    v_statut            text;
    v_montant_cumule    numeric;
    v_valeur_panier     numeric;
    v_ligne             record;
    v_stock_avant       numeric;
    v_stock_apres       numeric;
begin
    select statut, montant_cumule into v_statut, v_montant_cumule
    from tontines where id = p_tontine_id and entreprise_id = p_entreprise_id;

    if v_statut is null then
        raise exception 'Tontine introuvable.';
    end if;

    if v_statut <> 'atteint' then
        raise exception 'Le plafond de cette tontine n''est pas encore atteint.';
    end if;

    select coalesce(sum(pt.quantite * a.prix_vente), 0) into v_valeur_panier
    from panier_tontine pt
    join articles a on a.id = pt.article_id
    where pt.tontine_id = p_tontine_id;

    if v_valeur_panier = 0 then
        raise exception 'Le panier de cette tontine est vide.';
    end if;

    if v_valeur_panier > v_montant_cumule then
        raise exception
            'La valeur du panier (% ) dépasse le montant épargné (%).', v_valeur_panier, v_montant_cumule;
    end if;

    for v_ligne in
        select pt.article_id, pt.quantite
        from panier_tontine pt
        where pt.tontine_id = p_tontine_id
    loop
        select stock_actuel into v_stock_avant from articles where id = v_ligne.article_id;
        v_stock_apres := v_stock_avant - v_ligne.quantite;

        insert into mouvements_stock (
            entreprise_id, article_id, type_mouvement,
            quantite, quantite_avant, quantite_apres,
            motif, reference_document, utilisateur_id
        )
        values (
            p_entreprise_id, v_ligne.article_id, 'sortie_vente',
            -v_ligne.quantite, v_stock_avant, v_stock_apres,
            'Retrait tontine', p_tontine_id, p_utilisateur_id
        );

        update articles
            set stock_actuel = v_stock_apres, updated_at = now()
            where id = v_ligne.article_id;
    end loop;

    delete from panier_tontine where tontine_id = p_tontine_id;

    update tontines set statut = 'cloturee' where id = p_tontine_id;
end;
$$;
