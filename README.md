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
   - `migration_secteur_activite.sql` — secteur d'activité de l'entreprise
     (adapte la navigation à l'inscription)
   - `migration_notification_inscription.sql` — notifie l'admin par email
     à chaque nouvelle inscription (nécessite aussi de déployer la
     fonction `notifier-nouvelle-inscription`, voir plus bas)
   - `migration_essai_gratuit.sql` — les nouvelles inscriptions démarrent
     sur un essai gratuit de 7 jours au lieu d'un abonnement illimité
   - `migration_date_expiration.sql` — date d'expiration sur les articles
     (alimentation générale)
   - `migration_personnel_depenses.sql` — paiements personnel (quittance)
     et dépenses connexes, universel à tous les secteurs
   - `migration_tontine.sql` — tontines clients (souscription, cotisations,
     panier privé), universel à tous les secteurs
   - `migration_role_magasinier.sql` — 4e rôle dédié à la gestion physique
     du stock
   - `migration_ledger_creances.sql` — vrai grand livre des créances
     clients (remplace le simple compteur `solde_credit`) ; réécrit aussi
     `creer_vente` pour y passer les ventes à crédit
   - `migration_annulation_avoir.sql` — annulation / avoir de vente
     (retour total ou partiel, traçabilité complète) ; **doit être
     exécutée après** `migration_ledger_creances.sql`
   - `migration_multi_activites.sql` — gestion multi-activités réelle
     (plusieurs secteurs actifs simultanément)
   - `migration_dashboard_decisionnel.sql` — tableau de bord décisionnel
     AKWEO (CA, marge, créances, stock dormant, ruptures, argent
     immobilisé)
   - `migration_permissions_individuelles.sql` — le gérant peut ajuster,
     pour chaque membre de l'équipe et chaque module, un accès
     aucun/lecture/écriture (au-delà du simple rôle)
   - `migration_scalabilite_index.sql` — index composites pour tenir la
     charge à grande échelle. S'exécute normalement, en un seul bloc,
     comme les autres migrations (pas de `CONCURRENTLY` : le SQL Editor
     de Supabase exécute toujours son contenu dans une transaction
     implicite, ce qui rend `CONCURRENTLY` inutilisable là-bas quelle
     que soit la façon de le coller — chaque `CREATE INDEX` prend donc
     un court verrou en écriture pendant sa construction, sans
     conséquence au volume de données actuel)
   - `migration_cgu_conditions_tontine.sql` — acceptation des CGU,
     conditions de tontine du gérant, durcissement des RPC tontine
   - `migration_clotures.sql` — clôtures journalière / mensuelle /
     annuelle, comptage de caisse et verrou des périodes clôturées

   ⚠️ Les 3 migrations `ledger_creances` / `annulation_avoir` /
   `dashboard_decisionnel` touchent la fonction `creer_vente` en cascade
   (`migration_ledger_creances.sql` la réécrit, les suivantes en
   dépendent) : respecte l'ordre ci-dessus, ne saute pas de fichier.

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

### Secteur d'activité & navigation adaptative

- Choix du secteur d'activité à l'inscription (quincaillerie, dépôt de
  boissons, alimentation générale, vente de pièces détachées, ou "autre"
  avec un libellé libre) — champ `secteur_activite` sur l'entreprise
- Les modules de base (Vente, Stock, Inventaire, Clients, Factures,
  Équipe, Abonnement) restent disponibles pour tous les secteurs
- Les modules spécifiques ne s'affichent que pour le secteur concerné :
  Fournisseurs pour la quincaillerie, Dépôt de boissons pour ce secteur,
  Livraisons pour les deux. Alimentation générale, pièces détachées et
  "autre" n'ont pas encore de modules dédiés — à venir
- Le tableau de bord affiche un encart propre au secteur (dette
  fournisseurs pour la quincaillerie, casiers consignés en cours pour
  le dépôt de boissons)
- Sur mobile, au-delà de 4 onglets la barre basse affiche un bouton
  **Plus** qui ouvre la liste complète des modules disponibles

### Espace admin (super admin) & notifications d'inscription

- L'espace `/admin` filtre les entreprises par secteur d'activité (pilules
  avec compteur) et les regroupe par secteur dans la liste
- Un badge **Nouveau** est affiché sur les entreprises inscrites il y a
  moins de 48h, avec un compteur global dans l'en-tête
- Icône **cloche** dans l'en-tête de `/admin` : ouvre un panneau listant
  les inscriptions des 7 derniers jours et les abonnements à renouveler
  (statut "Bientôt expiré" ou "Expiré"), avec un badge du nombre total.
  Cliquer sur une entrée ouvre directement sa fiche pour modifier son
  abonnement
- À chaque inscription, un trigger PostgreSQL (`migration_notification_
  inscription.sql`) appelle la fonction Edge `notifier-nouvelle-
  inscription`, qui t'envoie un email via Brevo — indépendamment de
  l'app, tu es notifié même sans être connecté à l'espace admin
- Après avoir exécuté la migration, déploie la fonction Edge :
  ```bash
  supabase functions deploy notifier-nouvelle-inscription
  ```
  Elle réutilise les secrets déjà en place pour `verifier-abonnements-
  expiration` (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `ADMIN_EMAIL`,
  `CRON_SECRET`) — rien à reconfigurer si ceux-ci sont déjà définis.
- Chaque nouvelle inscription démarre sur un **essai gratuit de 7 jours**
  (`migration_essai_gratuit.sql`) plutôt que sur un abonnement illimité —
  le compteur de jours restants apparaît dès la création, et l'entreprise
  est automatiquement redirigée vers `/abonnement-expire` une fois
  l'essai écoulé si elle n'est pas passée sur un forfait payant

### Cloche de notification côté entreprise

- Chaque entreprise voit, sur son tableau de bord, une icône **cloche**
  rappelant l'état de son propre abonnement (forfait, jours restants ou
  expiré depuis X jours) — avec un point rouge dès que l'abonnement est
  en alerte ou expiré
- Un bouton "Gérer mon abonnement" y renvoie directement vers
  `/mon-abonnement` (uniquement pour le gérant — les autres rôles voient
  une invitation à le contacter)

### Type de vente (détail / semi-gros / gros)

- Sur `VentePage`, un menu déroulant "Type de vente" se cale
  automatiquement sur le type du client sélectionné (détail, demi-gros,
  gros), mais reste modifiable manuellement pour chaque vente — utile
  pour un client détail qui achète exceptionnellement en gros
- Le tarif appliqué à chaque article de la vente suit ce choix (via la
  tarification gros/demi-gros déjà configurée sur les articles)

### Alimentation générale — suivi de péremption

- Champ **Date d'expiration** dans le formulaire d'ajout d'article,
  visible pour les entreprises du secteur "Alimentation générale"
  (colonne `articles.date_expiration`, optionnelle et sans effet sur les
  autres secteurs)
- Sur le tableau de bord de ces entreprises, deux cartes dédiées :
  - **À évacuer sous 3 mois** — produits dont la date d'expiration
    approche, à écouler en priorité
  - **Produits expirés** — produits dont la date d'expiration est déjà
    dépassée, à retirer du stock

### Personnel (paiements + quittance) & Dépenses connexes

Module universel, disponible pour tous les secteurs d'activité —
visible dans la nav sous "Personnel & Dépenses" (gérant/comptable) :

- **Personnel** : fiche employé (nom, poste, téléphone, salaire de
  référence) distincte des comptes de connexion `utilisateurs` — un
  livreur ou un agent d'entretien n'a pas besoin d'un compte Akweo pour
  être payé. Chaque paiement (salaire, prime, avance, autre) génère une
  **quittance PDF numérotée** (`Q-YYYYMMDD-0001`), téléchargée
  automatiquement à l'enregistrement
- **Dépenses** : petites dépenses de fonctionnement classées par
  catégorie (loyer, électricité, eau, transport, fournitures,
  entretien, communication, autre)
- Le tableau de bord affiche, pour **tous les secteurs**, une carte
  "Sorties d'argent ce mois-ci" cumulant personnel + dépenses — la
  vision globale demandée, au-delà des seuls achats fournisseurs

### Tontine client

Module universel lui aussi, visible dans la nav sous "Tontines" (tous
rôles, comme Vente/Clients) :

- Un client souscrit à une tontine avec un **plafond libre** (le
  montant qu'il vise)
- Chaque versement (cotisation) génère un **reçu PDF numéroté**
  (`TR-YYYYMMDD-0001`) — fonction RPC atomique `enregistrer_cotisation_
  tontine`, qui met aussi à jour le cumul et bascule automatiquement le
  statut sur "Plafond atteint" dès que le cumul dépasse le plafond
- Le client peut, pendant ce temps, constituer un **panier privé**
  (articles + quantités) rattaché à sa tontine
- Une fois le plafond atteint, le bouton "Récupérer les produits"
  déclenche la fonction RPC atomique `recuperer_produits_tontine` :
  elle sort les articles du panier du stock, vide le panier et clôture
  la tontine — avec un garde-fou qui refuse la récupération si la
  valeur du panier dépasse le montant réellement épargné

### Consolidation : annulation/avoir, ledger, multi-activités, permissions, décisionnel

- **Annulation / avoir de vente** — depuis `Factures`, bouton "Annuler /
  Avoir" (réservé gérant/comptable) sur toute vente non déjà annulée.
  Retour total ou ligne par ligne, quantité par quantité. La fonction
  RPC atomique `creer_avoir_vente` remet la marchandise en stock, réduit
  la créance du client si la vente était à crédit (aucun effet sur le
  ledger pour une vente payée cash/mobile money — remboursement hors
  app), et referme automatiquement la vente si tout a fini par être
  retourné. Chaque avoir génère un PDF numéroté (`AV-YYYYMMDD-0001`)
- **Vrai ledger des créances** — `clients.solde_credit` n'est plus
  modifié qu'à travers `mouvements_creance` (vente à crédit, paiement,
  avoir, ajustement), chaque écriture datée, signée, tracée, avec le
  solde figé au moment où elle a eu lieu. Nouvelle fiche client
  (`/clients/:id`) affichant l'historique complet
- **Gestion multi-activités réelle** — une entreprise peut désormais
  activer plusieurs secteurs à la fois (`entreprises.secteurs_actifs`),
  ex : quincaillerie ET dépôt de boissons dans le même commerce. Réglage
  depuis `Paramètres` (gérant uniquement) ; le secteur principal reste
  toujours actif
- **Permissions fines** — nouvelle matrice centrale
  (`src/lib/permissions.ts`) avec 4 rôles : gérant (tout), comptable
  (pilotage financier : créances, factures, personnel & dépenses,
  tontines, lecture stock — pas la logistique fournisseurs/livraisons),
  magasinier *(nouveau)* (stock, inventaire, fournisseurs, livraisons,
  dépôt boissons — aucun module financier), vendeur (vente, clients,
  factures, tontines). Appliquée à la fois dans la navigation
  (`AppShell`) et en garde-fou côté route (`ProtectedRoute`, avec une
  page d'atterrissage par défaut par rôle pour éviter toute boucle de
  redirection)
- **Dashboard décisionnel AKWEO** — nouvelle section sur le tableau de
  bord (accès complet uniquement) : CA net du mois, marge nette du mois
  (l'un et l'autre déduits des avoirs émis), total des créances, argent
  immobilisé en stock (stock × prix d'achat), articles en rupture, et
  stock dormant (aucune vente depuis 60 jours — liste dépliable),
  calculés en un seul aller-retour via la fonction RPC
  `tableau_decisionnel`

### Permissions individuelles (au-delà du rôle)

Chaque rôle a un niveau d'accès **par défaut** pour chaque module (voir
`src/lib/permissions.ts`), mais le gérant peut désormais l'ajuster
**à volonté, module par module, pour chaque membre de son équipe** :

- Sur `Équipe`, bouton **"Accès"** à côté de chaque membre (sauf un
  autre gérant — ce rôle n'est jamais restreignable, toujours accès
  complet)
- Pour chaque module, trois niveaux possibles :
  - **Aucun** — le module disparaît de sa navigation, route bloquée
    même en accès direct par URL
  - **Lecture** — le module reste visible, mais les boutons de
    création/modification/action sont masqués (consultation seule)
  - **Écriture** — accès complet (comportement du rôle par défaut)
- Exemple concret : un comptable n'a normalement que la lecture sur le
  Stock — le gérant peut lui donner l'écriture ponctuellement, ou au
  contraire retirer complètement l'accès Factures à un vendeur en
  particulier
- Techniquement : table `permissions_utilisateur` (une ligne par
  couple utilisateur/module en écart avec le défaut du rôle), fonction
  RPC `definir_permissions_utilisateur` (réservée au gérant, refuse
  toute tentative sur un compte gérant), résolution combinée
  rôle + surcharges au chargement du profil (`useAuth`). Le niveau
  "lecture" est appliqué manuellement dans chaque page (boutons
  d'action conditionnés à `peutEcrire(permissions, "module")") plutôt
  que bloqué au niveau des routes, pour que la personne continue de
  voir les données sans pouvoir les modifier
- **Limite connue** : les accès sont résolus au chargement du profil,
  pas en temps réel. Si le gérant modifie les accès de quelqu'un
  pendant que cette personne est connectée, le changement ne
  s'applique qu'à sa prochaine connexion (ou après un rafraîchissement
  de la page)

### Scalabilité (des milliers d'utilisateurs simultanés)

Ce qui a été fait côté code pour tenir la charge à grande échelle :

- **Index composites** (`migration_scalabilite_index.sql`) sur
  `(entreprise_id, created_at)` pour toutes les tables à fort volume
  (ventes, mouvements de stock, factures, paiements, livraisons,
  paiements personnel, tontines...). Sans ça, une requête du type
  "les ventes de mon entreprise, les plus récentes d'abord" fait un
  scan + tri à chaque appel ; avec l'index composite, une seule lecture
  d'index suffit — l'écart se creuse fortement à mesure que
  l'historique de chaque entreprise grossit
- **Fonction RLS centrale déjà efficace** : `entreprise_de_l_utilisateur_
  connecte()` est marquée `stable` (mise en cache par requête) et
  s'appuie sur la contrainte `unique(auth_user_id)` de `utilisateurs`
  (index automatique) — l'isolation multi-tenant ne coûte donc qu'une
  lecture d'index par requête, pas un scan
- **Plafonds de sécurité sur les listes non bornées** : `listerClients`,
  `listerArticles`, `listerFournisseurs`, `listerLivraisons`,
  `listerEmployes`, `listerPaiementsPersonnel`, `listerTontines`
  ramenaient TOUTE la table sans limite — historiquement sans
  conséquence avec peu de données, mais dangereux avec des années
  d'historique accumulé sur des milliers d'entreprises actives.
  Plafonnées avec des seuils larges mais réels
- **Tableau de bord consolidé** : les indicateurs décisionnels (CA,
  marge, créances, stock dormant...) sont calculés en **un seul**
  aller-retour serveur (`tableau_decisionnel`) plutôt qu'en une
  dizaine de requêtes séparées — moins de connexions simultanées
  ouvertes par utilisateur actif
- **Frontend déjà scalable "gratuitement"** : build statique servi par
  Cloudflare Pages (CDN edge mondial, ne dépend pas de la charge
  serveur) ; authentification par JWT sans état côté serveur (pas de
  session à synchroniser entre instances)

Ce qui reste un choix **d'infrastructure**, hors de portée d'une
modification de code, et qu'il faut ajuster depuis le dashboard
Supabase à mesure que le trafic grandit :
- **Palier de calcul (compute) du projet Supabase** — le plan gratuit /
  Micro a des limites de connexions et de CPU ; des milliers
  d'utilisateurs simultanés demandent un palier supérieur (Pro puis
  compute add-ons dédiés)
- **Mode du pooler de connexions** (`Session` vs `Transaction`) —
  vérifie que le projet utilise bien PgBouncer en mode transaction
  (port 6543) pour le trafic applicatif à fort volume de connexions
  courtes, comme c'est le cas ici
- **Monitoring** — surveiller `Database → Reports` dans Supabase
  (requêtes lentes, connexions actives) une fois en charge réelle, pour
  repérer d'éventuels autres index manquants propres à ton usage
  précis
- **Réplicas de lecture**, si un jour le volume l'exige — au-delà de ce
  qu'un seul serveur Postgres, même bien indexé, peut absorber

Aucune de ces optimisations de code ne remplace un test de charge réel
avant un lancement à grande échelle — elles enlèvent les obstacles les
plus évidents et les plus coûteux à corriger après coup (les index, en
particulier, sont bien plus simples à poser tôt qu'une fois la table à
des millions de lignes).

### Filtrage par palier d'abonnement

- **Essai / Starter** (accès basique) : Tableau de bord, Vente, Stock,
  Tontines, Équipe (plafonnée à **2 comptes**, gérant compris) et
  Support. Toute tentative d'accès direct à une page réservée aux
  paliers supérieurs (lien, favori...) redirige silencieusement vers le
  tableau de bord (`ProtectedRoute`) — la navigation elle-même ne
  propose déjà que les pages autorisées (`AppShell`)
- **Business / Pro** (accès complet) : toutes les fonctionnalités,
  équipe plafonnée à **5 comptes**, gérant compris
- Le plafond de comptes est vérifié **côté serveur** dans la fonction
  Edge `creer-utilisateur-equipe` (jamais uniquement côté client) — si
  tu avais déjà déployé cette fonction, **redéploie-la** :
  `supabase functions deploy creer-utilisateur-equipe` ; la
  page Équipe affiche en plus un message et désactive le bouton
  d'ajout dès que la limite est atteinte
- Toute valeur de `plan_abonnement` autre que "essai"/"starter" donne un
  accès complet par défaut (`niveauAcces()` dans `lib/abonnement.ts`) —
  pour ne jamais bloquer à tort un palier personnalisé attribué
  manuellement depuis l'admin
- Nouvelle page **Support** (`/support`), accessible à tous les
  paliers : contact WhatsApp/téléphone/email configurable via
  `VITE_SUPPORT_TELEPHONE` / `VITE_SUPPORT_EMAIL`, + FAQ courte

### Confirmation d'email → retour direct vers l'app

- Le lien de confirmation envoyé à l'inscription redirige maintenant vers
  `/login` de l'app plutôt que nulle part. La session étant déjà valide à
  ce moment-là, l'utilisateur est immédiatement renvoyé vers l'écran de
  création d'entreprise (`/completer-inscription`) sans avoir à ressaisir
  son mot de passe.
- **Important** : dans Supabase, va dans `Authentication` → `URL
  Configuration` et ajoute l'URL de ton app (ex: `https://
  quincallerie.denistossou.com/login` ou `http://localhost:5173/login`
  en dev) à la liste **Redirect URLs** — sinon Supabase refusera la
  redirection et retombera sur le comportement par défaut.

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
