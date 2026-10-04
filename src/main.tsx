import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
// Capte l'invitation d'installation du navigateur dès le démarrage.
import "./hooks/useInstallation";
import { memoriserCodeDepuisUrl } from "./services/promotionsService";

// Lien d'agent commercial (…/?code=XXXX) : le code est gardé jusqu'au paiement.
memoriserCodeDepuisUrl();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
