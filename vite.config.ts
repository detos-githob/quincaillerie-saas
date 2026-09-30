import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.png", "apple-touch-icon.png"],
      manifest: {
        // Identifiant stable : ne jamais le changer, sinon les appareils
        // verraient une nouvelle application distincte.
        id: "/",
        name: "Akweo — gestion commerciale",
        short_name: "Akweo",
        description:
          "Ventes, stock, factures, clients, tontines et clôture de caisse pour les commerces. Fonctionne même sans connexion.",
        lang: "fr",
        dir: "ltr",
        theme_color: "#0E1424",
        background_color: "#0E1424",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "any",
        scope: "/",
        start_url: "/",
        categories: ["business", "productivity", "finance"],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // Appui long sur l'icône (Android, Windows).
        shortcuts: [
          { name: "Nouvelle vente", short_name: "Vente", url: "/vente", icons: [{ src: "pwa-192x192.png", sizes: "192x192" }] },
          { name: "Tontines", url: "/tontines", icons: [{ src: "pwa-192x192.png", sizes: "192x192" }] },
          { name: "Clôture de caisse", short_name: "Clôture", url: "/clotures", icons: [{ src: "pwa-192x192.png", sizes: "192x192" }] },
        ],
        // Fenêtre d'installation enrichie (Chrome, Android) et fiches store.
        screenshots: [
          {
            src: "screenshots/cloture-large.png",
            sizes: "1280x800",
            type: "image/png",
            form_factor: "wide",
            label: "Clôture de caisse : l'app calcule ce qui doit être en caisse",
          },
          {
            src: "screenshots/cloture-mobile.png",
            sizes: "780x1688",
            type: "image/png",
            form_factor: "narrow",
            label: "Clôture de caisse sur téléphone",
          },
        ],
      },
      workbox: {
        // Mise en cache de l'app shell pour un chargement hors-ligne.
        // Les données (Supabase) restent gérées par la file d'attente
        // applicative (src/services/offlineQueue.ts), pas par le cache HTTP.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        // Les captures d'écran du manifeste ne servent qu'à l'installation :
        // inutile de les précharger sur chaque appareil.
        globIgnores: ["**/screenshots/**"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            // Fichiers de police eux-mêmes : sans ce cache, l'app hors
            // ligne s'affichait avec une police de secours.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
