-- =====================================================================
-- MIGRATION : PAGE SUPPORT MODIFIABLE PAR LE SUPER ADMIN
-- À exécuter après migration_admin_paiements_comptes.sql.
--
-- Le contenu de la page « Support » (coordonnées, questions fréquentes,
-- guides PDF) est lu en base au lieu d'être écrit dans le code.
-- Tout le monde peut le lire ; seul le super admin peut le modifier.
-- Les guides PDF sont stockés dans le bucket Storage public « support ».
-- =====================================================================

-- ------------------------------------------------------------ coordonnées
create table if not exists support_parametres (
    id               smallint primary key default 1 check (id = 1),
    message_accueil  text not null default 'Une question, un blocage, une envie de faire évoluer l''appli ? On est là.'
                     check (char_length(message_accueil) <= 600),
    whatsapp         text check (whatsapp ~ '^\+?[0-9 ().-]{6,25}$'),
    telephone        text check (telephone ~ '^\+?[0-9 ().-]{6,25}$'),
    email            text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
    horaires         text check (char_length(horaires) <= 200),
    updated_at       timestamptz not null default now(),
    updated_by       uuid default auth.uid()
);
insert into support_parametres (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------ FAQ
create table if not exists support_faq (
    id          uuid primary key default gen_random_uuid(),
    question    text not null check (char_length(btrim(question)) between 3 and 300),
    reponse     text not null check (char_length(btrim(reponse)) between 1 and 3000),
    ordre       integer not null default 0,
    visible     boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ guides PDF
-- fichier : chemin dans le bucket « support » (guides/xxx.pdf) ou fichier
-- livré avec l'application (/guides/xxx.pdf). Aucune adresse externe :
-- impossible de faire pointer un guide vers un site tiers.
create table if not exists support_guides (
    id             uuid primary key default gen_random_uuid(),
    titre          text not null check (char_length(btrim(titre)) between 3 and 120),
    description    text check (char_length(description) <= 400),
    fichier        text not null check (fichier ~ '^/?guides/[A-Za-z0-9._-]{1,120}\.pdf$'),
    nom_fichier    text check (char_length(nom_fichier) <= 160),
    taille_octets  bigint check (taille_octets is null or taille_octets between 1 and 20971520),
    ordre          integer not null default 0,
    visible        boolean not null default true,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists idx_support_faq_ordre on support_faq (ordre, created_at);
create index if not exists idx_support_guides_ordre on support_guides (ordre, created_at);

-- ------------------------------------------------------------ horodatage
create or replace function support_horodater()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    if tg_table_name = 'support_parametres' then
        new.updated_by := auth.uid();
    end if;
    return new;
end;
$$;

drop trigger if exists trg_support_parametres_maj on support_parametres;
create trigger trg_support_parametres_maj before update on support_parametres
    for each row execute function support_horodater();
drop trigger if exists trg_support_faq_maj on support_faq;
create trigger trg_support_faq_maj before update on support_faq
    for each row execute function support_horodater();
drop trigger if exists trg_support_guides_maj on support_guides;
create trigger trg_support_guides_maj before update on support_guides
    for each row execute function support_horodater();

-- ------------------------------------------------------------ RLS
alter table support_parametres enable row level security;
alter table support_faq        enable row level security;
alter table support_guides     enable row level security;

drop policy if exists support_parametres_lecture on support_parametres;
create policy support_parametres_lecture on support_parametres
    for select to anon, authenticated using (true);
drop policy if exists support_parametres_admin on support_parametres;
create policy support_parametres_admin on support_parametres
    for update to authenticated using (public.est_super_admin()) with check (public.est_super_admin());

drop policy if exists support_faq_lecture on support_faq;
create policy support_faq_lecture on support_faq
    for select to anon, authenticated using (visible or public.est_super_admin());
drop policy if exists support_faq_admin on support_faq;
create policy support_faq_admin on support_faq
    for all to authenticated using (public.est_super_admin()) with check (public.est_super_admin());

drop policy if exists support_guides_lecture on support_guides;
create policy support_guides_lecture on support_guides
    for select to anon, authenticated using (visible or public.est_super_admin());
drop policy if exists support_guides_admin on support_guides;
create policy support_guides_admin on support_guides
    for all to authenticated using (public.est_super_admin()) with check (public.est_super_admin());

revoke all on support_parametres, support_faq, support_guides from anon, authenticated;
grant select on support_parametres, support_faq, support_guides to anon, authenticated;
grant update (message_accueil, whatsapp, telephone, email, horaires) on support_parametres to authenticated;
grant insert, update, delete on support_faq, support_guides to authenticated;

-- ------------------------------------------------------------ Storage
-- Bucket public en lecture (lien de téléchargement direct), PDF seulement,
-- 20 Mo maximum. Écriture réservée au super admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support', 'support', true, 20971520, array['application/pdf'])
on conflict (id) do update
    set public = true, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

drop policy if exists support_fichiers_lecture_admin on storage.objects;
create policy support_fichiers_lecture_admin on storage.objects
    for select to authenticated using (bucket_id = 'support' and public.est_super_admin());
drop policy if exists support_fichiers_ajout on storage.objects;
create policy support_fichiers_ajout on storage.objects
    for insert to authenticated with check (bucket_id = 'support' and public.est_super_admin());
drop policy if exists support_fichiers_modif on storage.objects;
create policy support_fichiers_modif on storage.objects
    for update to authenticated using (bucket_id = 'support' and public.est_super_admin());
drop policy if exists support_fichiers_suppr on storage.objects;
create policy support_fichiers_suppr on storage.objects
    for delete to authenticated using (bucket_id = 'support' and public.est_super_admin());

-- ------------------------------------------------------------ contenu de départ
insert into support_guides (titre, description, fichier, nom_fichier, taille_octets, ordre)
select 'Guide de démarrage',
       'Créer son compte, ajouter ses articles, vendre et facturer : chaque écran expliqué.',
       '/guides/guide-demarrage-akweo.pdf', 'guide-demarrage-akweo.pdf', 2199187, 0
where not exists (select 1 from support_guides);

insert into support_faq (question, reponse, ordre)
select q, r, o from (values
  ('Comment ajouter un membre à mon équipe ?',
   'Va dans « Équipe », puis « Ajouter un membre ». Le nombre de comptes autorisés dépend de ton offre (visible dans « Abonnement »).', 0),
  ('Comment passer à une offre supérieure ?',
   'Depuis « Abonnement » dans le menu Plus, choisis l''offre qui te convient et suis les étapes de paiement.', 1),
  ('J''ai fait une erreur sur une vente, comment l''annuler ?',
   'Plus › Factures, puis le bouton « Annuler / Avoir » sur la facture concernée. La vente reste tracée et le stock est remis à jour.', 2),
  ('Puis-je vendre sans connexion internet ?',
   'Oui. Après une première connexion avec internet sur l''appareil, les ventes sont enregistrées hors ligne et envoyées dès que la connexion revient.', 3)
) as t(q, r, o)
where not exists (select 1 from support_faq);
