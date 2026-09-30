# Modifications du 29/09/2026

## À faire AVANT de déployer
1. Exécuter `supabase/migration_cgu_conditions_tontine.sql` dans le SQL Editor Supabase.
2. Supabase > Authentication > URL Configuration > Redirect URLs : ajouter
   `https://<ton-domaine>/reinitialiser-mot-de-passe` (et `http://localhost:5173/reinitialiser-mot-de-passe` en dev).
3. Supabase > Authentication > Email Templates > « Reset Password » : traduire en français.
4. Supabase > Authentication : longueur minimale du mot de passe = 12.
5. Compléter les infos légales dans `src/lib/legal.ts` (RCCM, IFU, email support) et faire relire les CGU.

## Contenu
- Logo Akweo (en-tête, écrans de connexion, favicon, icônes PWA) ; noir des surfaces -> bleu nuit #0E1424 (`navy`), textes inchangés.
- Mot de passe oublié : /mot-de-passe-oublie et /reinitialiser-mot-de-passe.
- Case CGU à l'inscription + page /conditions-generales ; acceptation horodatée côté serveur.
- Conditions de tontine rédigées par le gérant (/tontines/conditions), acceptation obligatoire, texte figé sur chaque tontine.
- Inventaire, Clients, Factures, Livraisons, Équipe accessibles en Essai et Starter.
- Sécurité : RPC tontine vérifiant l'entreprise de l'appelant + verrous anti-concurrence.

## Changer les CGU plus tard
Modifier `src/features/legal/ConditionsGeneralesPage.tsx` puis incrémenter `CGU_VERSION` dans `src/lib/legal.ts`.

---

# Clôtures journalières, mensuelles et annuelles

## À faire AVANT de déployer
Exécuter `supabase/migration_clotures.sql` (après `migration_cgu_conditions_tontine.sql`).

## Fonctionnement
- **Journée** : l'app calcule ce qui doit être en caisse (fond d'ouverture + entrées − sorties en espèces). Le gérant saisit
  les espèces comptées et le fond laissé pour le lendemain ; tout écart doit être expliqué en commentaire.
  Le fond conservé devient le fond d'ouverture de la journée suivante.
- **Mois** : possible une fois le mois terminé et ses journées actives clôturées. Fige le résultat, les créances
  clients, l'épargne tontine due, la valeur du stock et les 5 meilleurs articles.
- **Année** : possible une fois les mois actifs clôturés, avec un graphique mois par mois.
- Chaque clôture produit un rapport PDF signable.

## Règles (appliquées côté serveur)
- Journée clôturée = aucune vente, dépense, cotisation, paiement, avoir ou casse ne peut y être ajouté, modifié ou
  supprimé. L'annulation par avoir reste possible (l'avoir est daté du jour où il est émis).
- Clôturer la journée en cours bloque les nouvelles opérations jusqu'au lendemain ; les ventes hors ligne restent
  en file d'attente et passent le lendemain.
- Clôtures dans l'ordre. À la toute première, l'historique antérieur n'est pas exigé.
- Réouverture : gérant uniquement, la plus récente seulement, avec motif, si le niveau supérieur n'est pas clôturé.
  Tracée dans `journal_audit`.
- Droits : le gérant clôture, le comptable consulte, les autres n'ont pas accès sauf ouverture dans Équipe.
- Dates calculées à l'heure du Bénin (`entreprises.fuseau_horaire`, `Africa/Porto-Novo` par défaut).
- Module disponible pour toutes les offres, Essai et Starter compris.

---

# Paiement de l'abonnement par MTN MoMo (API directe)

## Mise en place — SANDBOX (tests, aucun argent réel)
1. Exécuter `supabase/migration_paiements_abonnement.sql` dans le SQL Editor.
2. Créer l'API User et l'API Key sandbox (dans l'invite de commandes, à la racine du projet) :
   ```
   set MOMO_SUBSCRIPTION_KEY=ta_cle_primaire_collections
   node scripts\momo-sandbox-setup.mjs pinepbsrsjdroijrdxzo.supabase.co
   ```
   Le script affiche une commande `supabase secrets set ...` : exécute-la telle quelle.
3. Ajouter aussi `APP_URL` si ce n'est pas déjà fait : `supabase secrets set APP_URL=https://quincallerie.denistossou.com`
4. Déployer les fonctions :
   ```
   supabase functions deploy momo-paiement-abonnement
   supabase functions deploy momo-callback --no-verify-jwt
   supabase functions deploy verifier-paiement-abonnement
   ```
   `--no-verify-jwt` est obligatoire pour `momo-callback`, car MTN n'a pas de jeton Supabase. La fonction reste sûre :
   elle ignore le contenu du rappel et relit le statut réel chez MTN.
5. Front : `VITE_MOMO_SANDBOX=true` dans les variables d'environnement de l'hébergeur, puis redéployer.

En sandbox, MTN impose la devise EUR et fournit des numéros de test (voir la documentation « Sandbox » du portail
développeur). Le montant affiché reste en FCFA.

## Passage en PRODUCTION
Il faut un compte marchand MTN MoMo Bénin validé (« Go Live » depuis le portail partenaire). MTN fournit alors
l'API User, l'API Key et la clé d'abonnement de production. Ensuite :
```
supabase secrets set MOMO_TARGET_ENV=mtnbenin MOMO_BASE_URL=https://proxy.momoapi.mtn.com MOMO_CURRENCY=XOF MOMO_SUBSCRIPTION_KEY=... MOMO_API_USER=... MOMO_API_KEY=...
```
Puis `VITE_MOMO_SANDBOX=false` côté front, et redéployer.

## Sécurité
- Clés MTN uniquement en secrets Supabase, jamais dans le front ni sur GitHub.
- Le prix est fixé par le serveur (`supabase/functions/_shared/tarifs.ts`), jamais par le navigateur.
  **Si tu changes un prix, modifie aussi `src/services/abonnementService.ts` (affichage).**
- Le paiement n'est validé qu'après relecture du statut chez MTN (montant, devise et référence contrôlés).
- Un paiement ne prolonge l'abonnement qu'une seule fois, même confirmé plusieurs fois.
- Correction Kkiapay : un même `transactionId` ne peut plus prolonger l'abonnement plusieurs fois (faille de rejeu),
  et la fonction répond maintenant au CORS (la confirmation échouait depuis le navigateur).
- Un paiement validé après la fermeture de la page est rattrapé à l'ouverture de « Mon abonnement ».

---

# Isolation entre entreprises (sécurité multi-tenant)

## À faire
Exécuter `supabase/migration_isolation_entreprises.sql` dans le SQL Editor (après `migration_paiements_abonnement.sql`).
Aucun changement côté application ni redéploiement du front nécessaire. La migration peut être relancée sans risque.

## Faille corrigée
14 fonctions SQL contournaient la sécurité par entreprise sans vérifier l'appelant. Un utilisateur connecté
(l'inscription est libre) pouvait, avec l'identifiant d'une autre entreprise, lire son tableau de bord financier ou
écrire chez elle : ventes, avoirs, paiements, salaires, casses, consignes, inventaires, commandes, droits de l'équipe.
Deux de ces fonctions (réception de commande, validation d'inventaire) étaient même appelables sans être connecté.

## Ce qui est contrôlé maintenant
- L'appelant appartient à l'entreprise visée (et son compte est actif).
- Tout identifiant reçu (client, article, fournisseur, employé, vente, ligne, dépôt, membre) appartient à cette
  entreprise. Impossible par exemple de vendre l'article d'un autre commerce.
- L'auteur d'une opération est toujours l'utilisateur connecté (un vendeur ne peut plus attribuer une vente à un collègue).
- L'écriture dans le grand livre des créances n'est plus accessible depuis l'API.

## Règle pour les prochaines évolutions
Les fonctions d'origine s'appellent désormais `_interne_<nom>`. Pour modifier la logique d'une vente, modifier
`_interne_creer_vente` et **ne jamais** recréer `creer_vente` sans son contrôle d'accès : l'enveloppe protégée
serait écrasée.

---

# Ventes hors ligne fiables, sur plusieurs appareils (étape 1)

## À faire
1. Exécuter `supabase/migration_hors_ligne.sql` (après `migration_isolation_entreprises.sql`).
2. Pousser le code et redéployer le site. **Exécute la migration AVANT de déployer le front** : la nouvelle version
   envoie les ventes par la fonction `synchroniser_vente`, qui doit déjà exister.
3. Sur chaque appareil de vente, ouvrir l'app une fois **en ligne** : elle télécharge le profil, les articles et
   les clients, et pourra ensuite démarrer sans réseau.

## Ce qui fonctionne sans connexion
- Ouvrir l'app (même après l'avoir fermée ou après avoir redémarré l'appareil) et vendre, au comptant ou à crédit à
  un client existant. Le stock affiché baisse au fur et à mesure.
- Pas possible hors ligne pour l'instant : créer un nouveau client, les tontines, les entrées de stock et les
  factures. Ce sont les étapes 2 et 3.

## Synchronisation
- Automatique dès le retour du réseau, puis toutes les 30 s tant qu'il reste des ventes en attente. La pastille en
  haut de l'écran montre l'état ; un appui ouvre le détail et le bouton « Synchroniser maintenant ».
- Chaque vente porte un identifiant unique créé sur l'appareil : si la connexion coupe pendant l'envoi, elle n'est
  jamais enregistrée deux fois.
- La vente garde l'heure où elle a été faite, pas l'heure de synchronisation.
- Une vente datée d'une journée déjà clôturée n'est jamais perdue : elle est comptée sur la journée ouverte et
  marquée « saisie tardive » (heure réelle conservée).
- Une vente refusée par le serveur (ex : article supprimé entre-temps) est retentée, puis mise de côté dans la
  pastille rouge « à vérifier », avec les boutons « Relancer » et « Retirer ». Elle n'est jamais effacée sans
  action du gérant.
- Déconnexion : un avertissement s'affiche s'il reste des ventes non envoyées. Elles restent sur l'appareil et
  partent à la prochaine connexion du même compte.

## Clôture
- Le bouton « Clôturer la journée » est **bloqué** tant que l'appareil utilisé a des ventes non envoyées.
- La liste des **autres appareils** qui n'ont pas synchronisé depuis la journée à clôturer s'affiche, en
  avertissement : connecte-les avant de clôturer s'ils ont vendu hors ligne.

## Correction au passage
Deux appareils qui synchronisaient en même temps pouvaient faire perdre une déduction de stock ou obtenir le même
numéro de vente. Les ventes d'une entreprise sont désormais traitées l'une après l'autre (testé : 50 ventes
simultanées depuis 2 appareils → stock et numéros exacts).

---

# Clients et tontine hors ligne (étape 2)

## À faire
1. Exécuter `supabase/migration_hors_ligne_tontine.sql` (après `migration_hors_ligne.sql`), **avant** de déployer le site.
2. Déployer le site.
3. Sur chaque appareil, ouvrir une fois **en ligne** les pages Clients et Tontines (et les tontines à suivre) :
   elles sont alors disponibles hors ligne.

## Ce qui fonctionne maintenant sans connexion
- **Clients** : créer un nouveau client, y compris directement depuis une vente ou une tontine ; consulter la liste et
  la fiche d'un client.
- **Tontines** : consulter la liste et le détail ; ouvrir une nouvelle tontine (conditions acceptées par le client) ;
  **encaisser des cotisations**, avec un reçu PDF **provisoire** (n° `PROV-…`). La jauge et le cumul avancent sur
  l'appareil, et la tontine passe en « atteint » si le plafond est franchi.
- Après synchronisation, le numéro définitif (`TR-…`) apparaît dans l'historique de la tontine.

## Reste en ligne uniquement (volontairement)
- **Retrait des produits d'une tontine** : sinon, un client pourrait retirer deux fois sa marchandise sur deux appareils
  déconnectés.
- Ajout ou retrait d'articles dans le panier d'une tontine.
- Encaissement d'une créance client (message clair si tentative hors ligne).

## Synchronisation
Une seule file, dans l'ordre réel : un client créé hors ligne part avant la vente ou la tontine qui l'utilise, et une
tontine avant ses cotisations. Toutes les opérations sont protégées contre les doublons (testé avec une coupure en
pleine synchronisation) et gardent leur heure réelle. Une cotisation datée d'une journée déjà clôturée est comptée
aujourd'hui et marquée « saisie tardive ». Les ventes en attente de l'étape 1 sont reprises automatiquement.

## Sécurité ajoutée
Une tontine ne peut plus être ouverte pour le client d'une autre entreprise (contrôle serveur).

---

# Factures et stock hors ligne (étape 3)

## À faire
1. Exécuter `supabase/migration_hors_ligne_stock.sql` (après `migration_hors_ligne_tontine.sql`), **avant** de
   déployer le site.
2. Déployer le site. Ouvrir une fois en ligne la page Factures sur chaque appareil.

## Factures hors ligne
- La page Factures s'ouvre sans réseau : factures déjà téléchargées + **factures provisoires** des ventes en attente
  (badge « Provisoire · en attente d'envoi »), téléchargeables en PDF.
- Le PDF porte le titre « FACTURE PROVISOIRE », un numéro `PROV-…` et la mention « établie hors connexion ». Une vente
  en facture normalisée n'est jamais présentée comme normalisée tant qu'elle n'a pas été envoyée : la facture
  normalisée DGI est émise après synchronisation.
- Après synchronisation, la facture provisoire est remplacée automatiquement par la vraie facture.
- Avoir et conversion de type restent disponibles sur les factures définitives uniquement.

## Stock hors ligne
- Les boutons + (réapprovisionnement) et − (correction) de la page Stock fonctionnent sans réseau. Le stock affiché
  est mis à jour sur l'appareil, et le mouvement part à la synchronisation.

## Défaut corrigé (présent aussi en ligne)
L'app calculait le nouveau stock sur l'appareil puis **écrasait** celui du serveur : une vente faite au même moment
sur un autre appareil disparaissait du stock, sans erreur. Le serveur applique désormais la **variation** (+20, −3)
sur le stock réel, sous le même verrou que les ventes (testé : 30 ventes + 20 entrées simultanées → stock exact et
historique cohérent ligne par ligne).

## Bilan du hors ligne (étapes 1 à 3)
Fonctionne sans réseau : ventes, factures provisoires, clients, tontines et cotisations (reçus provisoires), entrées et
corrections de stock, clôture préparée (bloquée tant que l'appareil a des opérations en attente).
Reste en ligne : retrait des produits d'une tontine, panier de tontine, encaissement des créances, avoirs,
fournisseurs, inventaires, dépenses et personnel, paiement de l'abonnement.
