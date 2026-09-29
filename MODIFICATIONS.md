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
