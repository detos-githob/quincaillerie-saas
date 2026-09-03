-- =====================================================================
-- MIGRATION PHASE 2
-- À exécuter UNE FOIS dans le SQL Editor de Supabase, en plus du
-- schema.sql déjà en place (ne pas re-exécuter schema.sql en entier,
-- il recréerait des tables déjà existantes et échouerait).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. INSCRIPTION SELF-SERVICE
-- Permet à un nouvel utilisateur (déjà authentifié via Supabase Auth)
-- de créer sa propre entreprise et de se lier comme gérant, sans passer
-- par le SQL Editor. Fonction "security definer" : elle contourne les
-- policies RLS classiques (comme creer_vente), donc elle fait ses
-- propres vérifications de sécurité en interne.
-- ---------------------------------------------------------------------
create or replace function creer_entreprise_et_gerant(
    p_nom_entreprise text,
    p_regime_fiscal  text,
    p_telephone      text,
    p_nom_gerant     text
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_entreprise_id uuid;
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        raise exception 'Utilisateur non authentifié.';
    end if;

    if exists (select 1 from utilisateurs where auth_user_id = v_uid) then
        raise exception 'Ce compte est déjà associé à une entreprise.';
    end if;

    insert into entreprises (nom, regime_fiscal, telephone)
    values (p_nom_entreprise, coalesce(p_regime_fiscal, 'forfait'), p_telephone)
    returning id into v_entreprise_id;

    insert into utilisateurs (entreprise_id, auth_user_id, nom, role)
    values (v_entreprise_id, v_uid, p_nom_gerant, 'gerant');

    return v_entreprise_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. ALERTES AUTOMATIQUES SUR LE STOCK
-- Dès qu'un mouvement de stock fait passer un article sous son seuil
-- d'alerte (ou en rupture), une ligne est insérée automatiquement dans
-- `alertes`. Quand le stock repasse au-dessus du seuil, les alertes
-- ouvertes pour cet article sont marquées comme résolues (lue = true).
-- Un contrôle anti-doublon évite de spammer une alerte à chaque vente
-- tant que la précédente n'est pas résolue.
-- ---------------------------------------------------------------------
create or replace function gerer_alertes_stock()
returns trigger
language plpgsql
security definer
as $$
begin
    if NEW.stock_actuel <= 0 then
        if not exists (
            select 1 from alertes
            where article_id = NEW.id and type_alerte = 'rupture' and lue = false
        ) then
            insert into alertes (entreprise_id, type_alerte, article_id, message, niveau)
            values (
                NEW.entreprise_id, 'rupture', NEW.id,
                NEW.designation || ' est en rupture de stock.', 'critique'
            );
        end if;

    elsif NEW.stock_actuel <= NEW.seuil_alerte then
        if not exists (
            select 1 from alertes
            where article_id = NEW.id and type_alerte = 'stock_bas' and lue = false
        ) then
            insert into alertes (entreprise_id, type_alerte, article_id, message, niveau)
            values (
                NEW.entreprise_id, 'stock_bas', NEW.id,
                'Il reste ' || NEW.stock_actuel || ' ' || NEW.unite || ' de ' || NEW.designation
                    || ' (seuil : ' || NEW.seuil_alerte || ').',
                'warning'
            );
        end if;

    else
        -- Stock revenu au-dessus du seuil : on résout les alertes ouvertes.
        update alertes
            set lue = true
            where article_id = NEW.id
              and type_alerte in ('rupture', 'stock_bas')
              and lue = false;
    end if;

    return NEW;
end;
$$;

drop trigger if exists trg_alertes_stock on articles;
create trigger trg_alertes_stock
    after update of stock_actuel on articles
    for each row
    execute function gerer_alertes_stock();

-- NOTE : les alertes de type 'creance_retard' restent calculées à
-- l'affichage (dashboard) plutôt qu'en base, car "être en retard"
-- dépend du temps qui passe, pas d'un événement précis. Les
-- automatiser proprement nécessiterait une tâche planifiée
-- (extension pg_cron), prévue dans un prochain lot.

-- ---------------------------------------------------------------------
-- 3. MODULE INVENTAIRE
-- Deux fonctions atomiques, sur le même principe que creer_vente :
-- démarrer un inventaire fige une photo du stock théorique de chaque
-- article ; le valider applique les écarts saisis comme mouvements de
-- stock, en une seule transaction.
-- ---------------------------------------------------------------------
create or replace function demarrer_inventaire(
    p_entreprise_id  uuid,
    p_utilisateur_id uuid,
    p_depot_id       uuid default null
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_inventaire_id uuid;
begin
    insert into inventaires (entreprise_id, depot_id, statut, utilisateur_id)
    values (p_entreprise_id, p_depot_id, 'en_cours', p_utilisateur_id)
    returning id into v_inventaire_id;

    insert into lignes_inventaire (inventaire_id, article_id, quantite_theorique)
    select v_inventaire_id, id, stock_actuel
    from articles
    where entreprise_id = p_entreprise_id and actif = true;

    return v_inventaire_id;
end;
$$;

create or replace function valider_inventaire(
    p_inventaire_id  uuid,
    p_utilisateur_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
    v_entreprise_id uuid;
    v_ligne record;
    v_ecart numeric;
begin
    select entreprise_id into v_entreprise_id from inventaires where id = p_inventaire_id;

    for v_ligne in
        select * from lignes_inventaire
        where inventaire_id = p_inventaire_id
          and quantite_comptee is not null
          and quantite_comptee <> quantite_theorique
    loop
        v_ecart := v_ligne.quantite_comptee - v_ligne.quantite_theorique;

        insert into mouvements_stock (
            entreprise_id, article_id, type_mouvement,
            quantite, quantite_avant, quantite_apres,
            motif, reference_document, utilisateur_id
        )
        values (
            v_entreprise_id, v_ligne.article_id, 'ajustement_inventaire',
            v_ecart, v_ligne.quantite_theorique, v_ligne.quantite_comptee,
            'Ajustement suite à inventaire', p_inventaire_id, p_utilisateur_id
        );

        update articles
            set stock_actuel = v_ligne.quantite_comptee, updated_at = now()
            where id = v_ligne.article_id;
    end loop;

    update inventaires
        set statut = 'valide', date_fin = now()
        where id = p_inventaire_id;
end;
$$;
