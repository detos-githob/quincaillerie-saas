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
