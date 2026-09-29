/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Barlow Condensed'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
      },
      colors: {
        // Bleu nuit de la charte Akweo (fond du logo). Remplace le noir
        // des surfaces (barres, boutons, puces actives, overlays). Les
        // textes restent en noir (stone-900).
        navy: {
          DEFAULT: "#0E1424",
          900: "#0E1424",
          800: "#1A2238",
          700: "#27314B",
        },
        // Couleurs de la marque, reprises du logo
        marque: {
          or: "#ECA71E",
          creme: "#FCFAF3",
        },
      },
    },
  },
  plugins: [],
};
