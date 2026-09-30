# Installer Akweo sur les appareils

Akweo est une **application web progressive (PWA)** : une seule version, installable sur ordinateur, téléphone et
tablette, qui fonctionne hors connexion et se met à jour toute seule. Les données restent sur le serveur Supabase ;
l'appareil garde de quoi travailler hors ligne et synchronise au retour du réseau.

Chrome a été vérifié sur la version de production : **aucune erreur d'installabilité**.

---

## Voie 1 — Installation directe (recommandée, gratuite, tous appareils)

Envoie aux commerçants le lien : **https://quincallerie.denistossou.com/installer**

La page détecte l'appareil et affiche les bonnes instructions :
- **Android** (Chrome) : bouton « Installer l'application ».
- **Windows / Mac / Linux** (Chrome ou Edge) : bouton « Installer l'application » ou icône dans la barre d'adresse.
- **iPhone / iPad** (Safari) : Partager → « Sur l'écran d'accueil ».

Une fois l'app installée, un bouton « Installer » apparaît aussi dans la barre du haut quand le navigateur le permet.
Appui long sur l'icône (Android, Windows) : raccourcis **Nouvelle vente**, **Tontines**, **Clôture**.

## Voie 2 — Fichier APK Android / Google Play (gratuit, 10 minutes)

1. Déploie le site (le manifeste et les captures d'écran doivent être en ligne).
2. Va sur **https://www.pwabuilder.com**, saisis `https://quincallerie.denistossou.com`, puis **Package for stores → Android**.
3. Renseigne l'identifiant du paquet (ex. `com.akweo.app`), puis télécharge le zip. Il contient :
   - un **`.apk`** : à installer directement sur un téléphone (autoriser les « sources inconnues ») ou à partager ;
   - un **`.aab`** : le fichier à déposer sur le **Google Play Console** (compte développeur : 25 USD, une seule fois) ;
   - une **clé de signature** : **garde-la précieusement et hors de GitHub**. Sans elle, impossible de publier une
     mise à jour sur le Play Store ;
   - un fichier **`assetlinks.json`**.
4. Copie `assetlinks.json` dans **`public/.well-known/assetlinks.json`**, puis redéploie. Sans ce fichier, l'app Android
   affiche une barre d'adresse en haut de l'écran.

L'APK affiche le site en ligne : **toutes les mises à jour du site arrivent sans republier l'APK.**

## Voie 3 — Windows (installateur ou Microsoft Store)

Pour les PC, l'installation directe (Voie 1, avec Edge ou Chrome) est la plus simple : icône sur le bureau et dans le
menu Démarrer, fenêtre dédiée.
Pour une fiche **Microsoft Store** : PWABuilder → **Windows** génère un paquet MSIX à déposer sur Microsoft Partner
Center (compte développeur requis).

## iPhone / iPad

Installation par Safari (Voie 1). Publier sur l'**App Store** demande un compte Apple Developer (99 USD par an) et un
Mac. Apple refuse souvent les applications qui ne sont qu'un site web emballé : la Voie 1 est la bonne option.

---

## Mises à jour
Chaque déploiement du site met à jour toutes les installations (PWA et APK) au prochain lancement avec internet.
**Ne jamais modifier le champ `id` du manifeste** (`vite.config.ts`) : les appareils verraient une application
différente.
