// Récupération automatique après une mise en ligne.
// Chaque déploiement renomme les fichiers de l'app (TontinesPage-xxxx.js).
// Un onglet ou un service worker resté sur l'ancienne version demande alors
// des fichiers qui n'existent plus : la page restait blanche. On recharge
// une seule fois (garde-fou contre une boucle si le serveur est vraiment en panne).

export const CLE_RECHARGEMENT = "akweo-rechargement-version";

export function rechargerUneFois(): boolean {
  try {
    const derniere = Number(sessionStorage.getItem(CLE_RECHARGEMENT) || 0);
    if (Date.now() - derniere < 30_000) return false;
    sessionStorage.setItem(CLE_RECHARGEMENT, String(Date.now()));
  } catch {
    /* stockage indisponible : on tente quand même */
  }
  window.location.reload();
  return true;
}

export function surveillerVersionsObsoletes() {
  // Émis par Vite quand un fichier préchargé est introuvable.
  window.addEventListener("vite:preloadError", (e) => {
    if (rechargerUneFois()) e.preventDefault();
  });
}
