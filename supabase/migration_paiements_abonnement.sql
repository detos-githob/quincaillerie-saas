-- =====================================================================
-- MIGRATION : REGISTRE DES PAIEMENTS D'ABONNEMENT (MTN MoMo + Kkiapay)
-- À exécuter après migration_clotures.sql.
--
--   1. Chaque tentative de paiement est enregistrée AVANT d'être envoyée
--      au fournisseur (MTN MoMo) ou dès sa vérification (Kkiapay).
--   2. Une référence fournisseur ne peut être utilisée qu'une seule fois
--      (corrige la faille de rejeu : un même transactionId Kkiapay
--      pouvait prolonger l'abonnement plusieurs fois).
--   3. appliquer_paiement_abonnement() prolonge l'abonnement de façon
--      atomique et idempotente : un paiement confirmé deux fois (rappel
--      MTN + vérification du navigateur) ne prolonge qu'une fois.
--   4. Écriture réservée au serveur (Edge Functions, clé service_role).
-- =====================================================================

create table if not exists paiements_abonnement (
    id                      uuid primary key default gen_random_uuid(),  -- = X-Reference-Id MTN
    entreprise_id           uuid not null references entreprises(id) on delete cascade,
    fournisseur             text not null check (fournisseur in ('mtn_momo', 'kkiapay')),
    reference_fournisseur   text,               -- financialTransactionId MTN / transactionId Kkiapay
    plan                    text not null check (plan in ('starter', 'business')),
    periodicite             text not null check (periodicite in ('mensuel', 'annuel')),
    montant                 numeric(12,2) not null check (montant > 0),
    devise                  text not null default 'XOF',
    telephone               text,               -- numéro débité (MSISDN)
    statut                  text not null default 'en_attente'
                            check (statut in ('en_attente', 'reussi', 'echoue', 'expire')),
    raison_echec            text,
    date_expiration_avant   date,
    date_expiration_apres   date,
    cree_par                uuid references utilisateurs(id),
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    confirme_le             timestamptz
);

-- Anti-rejeu : une référence fournisseur = un seul paiement.
create unique index if not exists uq_paiements_abonnement_reference
    on paiements_abonnement(fournisseur, reference_fournisseur)
    where reference_fournisseur is not null;

create index if not exists idx_paiements_abonnement_entreprise
    on paiements_abonnement(entreprise_id, created_at desc);
create index if not exists idx_paiements_abonnement_en_attente
    on paiements_abonnement(statut, created_at)
    where statut = 'en_attente';

alter table paiements_abonnement enable row level security;

-- Lecture : le gérant de l'entreprise (historique de ses paiements).
-- Aucune policy d'écriture : seules les Edge Functions (service_role)
-- créent et mettent à jour les paiements.
drop policy if exists "lecture_paiements_abonnement_gerant" on paiements_abonnement;
create policy "lecture_paiements_abonnement_gerant"
    on paiements_abonnement for select
    using (
        entreprise_id = entreprise_de_l_utilisateur_connecte()
        and exists (
            select 1 from utilisateurs u
            where u.auth_user_id = auth.uid() and u.role = 'gerant'
        )
    );

-- ---------------------------------------------------------------------
-- Application d'un paiement confirmé par le fournisseur
-- ---------------------------------------------------------------------
create or replace function appliquer_paiement_abonnement(
    p_paiement_id           uuid,
    p_montant_confirme      numeric,
    p_reference_fournisseur text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_p         paiements_abonnement%rowtype;
    v_exp       date;
    v_base      date;
    v_nouvelle  date;
begin
    -- Verrou : deux confirmations simultanées sont sérialisées ; la
    -- seconde voit le statut « reussi » et ne fait rien.
    select * into v_p from paiements_abonnement where id = p_paiement_id for update;
    if not found then
        raise exception 'Paiement introuvable.';
    end if;

    if v_p.statut = 'reussi' then
        return jsonb_build_object('deja_applique', true, 'date_expiration', v_p.date_expiration_apres);
    end if;

    -- 'expire' reste applicable : si MTN confirme tardivement, l'argent a
    -- bien été débité et le client doit être servi.
    if v_p.statut not in ('en_attente', 'expire') then
        raise exception 'Ce paiement ne peut plus être validé (statut : %).', v_p.statut;
    end if;

    if p_montant_confirme is null or p_montant_confirme < v_p.montant then
        update paiements_abonnement
            set statut = 'echoue', raison_echec = 'Montant confirmé insuffisant : ' || coalesce(p_montant_confirme::text, 'inconnu'),
                updated_at = now()
            where id = v_p.id;
        -- Pas de raise : il annulerait aussi l'enregistrement de l'échec.
        return jsonb_build_object('erreur', 'Le montant payé ne correspond pas à l''offre.');
    end if;

    select date_expiration_abonnement into v_exp
    from entreprises where id = v_p.entreprise_id
    for update;

    -- Abonnement encore actif : on prolonge depuis sa date d'expiration
    -- pour ne pas faire perdre les jours déjà payés.
    v_base := greatest(current_date, coalesce(v_exp, current_date));
    v_nouvelle := (v_base + case when v_p.periodicite = 'annuel' then interval '1 year' else interval '1 month' end)::date;

    update entreprises
        set plan_abonnement = v_p.plan,
            periodicite_abonnement = v_p.periodicite,
            date_expiration_abonnement = v_nouvelle,
            actif = true,
            derniere_alerte_envoyee = null
        where id = v_p.entreprise_id;

    update paiements_abonnement
        set statut = 'reussi',
            reference_fournisseur = coalesce(p_reference_fournisseur, reference_fournisseur),
            date_expiration_avant = v_exp,
            date_expiration_apres = v_nouvelle,
            confirme_le = now(),
            raison_echec = null,
            updated_at = now()
        where id = v_p.id;

    insert into journal_audit (entreprise_id, utilisateur_id, action, table_concernee, enregistrement_id, donnees_apres)
    values (v_p.entreprise_id, v_p.cree_par, 'paiement_abonnement', 'paiements_abonnement', v_p.id,
            jsonb_build_object('fournisseur', v_p.fournisseur, 'plan', v_p.plan, 'periodicite', v_p.periodicite,
                               'montant', v_p.montant, 'expiration', v_nouvelle));

    return jsonb_build_object('deja_applique', false, 'date_expiration', v_nouvelle);
end;
$$;

-- Réservée au serveur : un utilisateur ne doit jamais pouvoir s'auto-
-- valider un paiement.
revoke all on function appliquer_paiement_abonnement(uuid, numeric, text) from public, anon, authenticated;
grant execute on function appliquer_paiement_abonnement(uuid, numeric, text) to service_role;
