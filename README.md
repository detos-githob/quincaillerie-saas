# Akweo — SaaS de gestion commerciale

Application de gestion pour PME au Bénin, multi-verticaux : stock, ventes,
facturation, clients, fournisseurs, livraisons, tableau de bord de santé
de l'entreprise. Sert à la fois les quincailleries (dont la vente en gros
et demi-gros) et les dépôts de boissons (casiers, consignes, casses).

Statut : **MVP Phase 1** fonctionnel — Stock, Vente, Facture simple,
Clients, Rapport journalier / Dashboard, Fournisseurs & vente en gros,
Livraisons, Dépôt de boissons. Voir la section Roadmap en bas pour la
suite.

## Stack technique

- **Frontend** : React 19 + TypeScript + Vite, PWA (fonctionne hors-ligne,
  installable sur mobile)
- **Backend / Base de données** : Supabase (PostgreSQL managé), avec
  isolation multi-tenant par Row Level Security (RLS)
- **Style** : Tailwind CSS
- **PDF** : jsPDF (génération des factures)
- **Graphiques** : Recharts
- **Hébergement recommandé** : Cloudflare Pages (déjà utilisé pour ton
  portfolio — même logique de déploiement)

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com), crée un compte et un
   nouveau projet.
2. Une fois le projet créé, va dans **SQL Editor** et colle le contenu
   entier du fichier `supabase/schema.sql` de ce projet, puis exécute-le.
   Cela crée toutes les tables, les policies de sécurité (RLS) et la
   fonction `creer_vente` utilisée pour enregistrer les ventes.
3. Va dans **Project Settings > API** et note :
   - `Project URL`
   - `anon public key`
4. Toujours dans **SQL Editor**, exécute ensuite, une par une et dans
   l'ordre, les migrations présentes dans `supabase/` :
   - `migration_phase2.sql`
   - `migration_admin.sql`
   - `migration_notifications.sql`
   - `migration_type_facture.sql`
   - `migration_fournisseurs.sql` — fournisseurs, tarification gros /
     demi-gros, commandes fournisseur, livraisons
   - `migration_depot_boissons.sql` — casiers, consignes, retours, casses
     (dépôt de boissons)

## 2. Configurer le projet local

```bash
cp .env.example .env
```

Ouvre `.env` et remplis avec les valeurs récupérées à l'étape précédente :

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=ta_cle_anon_publique
```

Puis installe les dépendances :

```bash
npm install
```

## 3. Créer ta première entreprise et ton compte gérant

Pour l'instant, il n'y a pas encore d'écran d'inscription (self-service) —
c'est prévu en Phase 2. En attendant, crée manuellement ton compte :

1. Dans Supabase, va dans **Authentication > Users > Add user**, crée
   ton compte avec ton email et un mot de passe.
2. Va dans **SQL Editor** et exécute (en remplaçant les valeurs) :

```sql
-- Créer l'entreprise
insert into entreprises (nom, ifu, regime_fiscal, telephone)
values ('Quincaillerie ATTIOGBE', 'TON_IFU_ICI', 'forfait', '+229 00 00 00 00')
returning id;
-- note l'id retourné, tu en as besoin pour l'étape suivante

-- Lier ton compte utilisateur créé plus haut à cette entreprise en tant que gérant
insert into utilisateurs (entreprise_id, auth_user_id, nom, role)
values (
  'ID_ENTREPRISE_COPIE_CI_DESSUS',
  (select id from auth.users where email = 'ton-email@exemple.com'),
  'Ton Nom',
  'gerant'
);
```

## 4. Lancer en local

```bash
npm run dev
```

Ouvre l'URL affichée (généralement `http://localhost:5173`), connecte-toi
avec l'email/mot de passe créés à l'étape 3.

## 5. Déployer sur Cloudflare Pages

```bash
npm run build
```

Puis, comme pour ton portfolio :
1. Pousse ce projet sur un nouveau dépôt GitHub.
2. Dans Cloudflare Pages, connecte le dépôt, avec comme build command
   `npm run build` et comme dossier de sortie `dist`.
3. Ajoute tes variables d'environnement (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`) dans les paramètres du projet Cloudflare
   Pages (Settings > Environment variables) — sinon le site déployé ne
   pourra pas se connecter à Supabase.
4. Connecte ton propre nom de domaine comme tu l'as déjà fait.

## Ce qui est inclus (Phase 1)

- Connexion sécurisée (Supabase Auth)
- Écran de vente / caisse avec panier, choix du mode de paiement
  (espèces, Mobile Money, crédit), et **file d'attente hors-ligne** :
  si le réseau coupe pendant une vente, elle est stockée localement et
  synchronisée automatiquement au retour du réseau
- Enregistrement atomique de la vente côté base de données (fonction
  `creer_vente`) : vente + lignes + mouvements de stock + facture sont
  écrits ensemble, jamais à moitié
- Gestion du stock (liste, ajout d'article, ajustement manuel)
- Gestion des clients (liste, créances, encaissement de paiement)
- Génération de facture simple en PDF téléchargeable
- Tableau de bord "santé de l'entreprise" : ventes du jour, marge du
  jour, alertes stock bas/rupture, créances en retard, top des ventes

### Fournisseurs, vente en gros / demi-gros & livraison

- Fiche fournisseur (contact, délai de livraison, dette envers lui) et
  règlement de cette dette
- Commandes fournisseur avec lignes d'articles, et **réception totale ou
  partielle** : le stock et la dette fournisseur sont mis à jour de façon
  atomique à chaque réception (fonction `receptionner_commande_fournisseur`)
- Tarification par palier sur chaque article (prix détail / demi-gros /
  gros, déclenchée par un seuil de quantité ou par le type de client) —
  configurable en option sur la fiche article, appliquée automatiquement
  à l'écran de vente
- Type de client (détail / demi-gros / gros) sur la fiche client
- Suivi des livraisons (adresse, livreur, statut en attente → en cours →
  livrée)

### Dépôt de boissons — casiers, consignes, casses

- Activation de la consigne par article (bouteilles par casier, prix de
  consigne casier/bouteille) — n'affecte pas les articles qui ne
  l'utilisent pas
- Suivi du solde de consigne par client (casiers/bouteilles qu'il doit
  encore rendre), alimenté par les sorties et diminué par les retours
  (fonction atomique `enregistrer_mouvement_consigne`)
- Déclaration des casses (bouteilles/casiers cassés) : sort la quantité
  du stock et journalise la perte financière (fonction atomique
  `enregistrer_casse`)

## Roadmap (prochaines phases)

**Phase 2**
- Écran d'inscription self-service (créer son entreprise sans passer par le SQL Editor)
- Module Inventaire (comptage physique, écarts)
- Table `alertes` alimentée automatiquement (actuellement les alertes stock/créances sont calculées à la volée à l'affichage, pas encore stockées ni notifiées par SMS)
- Rôles avancés : masquer la marge bénéficiaire aux vendeurs (actuellement tout utilisateur connecté voit tout — à restreindre par rôle dans l'UI)
- Notifications SMS (stock bas, créance en retard)
- Multi-dépôt

**Phase 3**
- Intégration API e-MECeF pour la facture normalisée (obligatoire pour
  les entreprises au régime réel / TVA) — le champ `type_facture` et
  `statut_emecef` sont déjà prévus dans le schéma pour cette évolution
- Paiement des abonnements SaaS via Mobile Money

## Limitations connues de ce MVP (à ne pas oublier)

- Pas encore d'écran de gestion des utilisateurs/rôles dans l'UI (à faire en SQL pour l'instant)
- Le calcul de stock lors d'un ajustement manuel n'est pas protégé contre les écritures concurrentes (deux appareils qui ajustent le même article en même temps) — la vente, elle, est protégée grâce à la fonction `creer_vente`
- La file d'attente hors-ligne utilise le localStorage (simple mais limité) — à migrer vers IndexedDB si le volume de ventes hors-ligne devient important
