// Échappe une valeur saisie par un utilisateur avant de l'insérer dans
// le HTML d'un email : un nom d'entreprise ne peut pas devenir un lien
// ou un bouton piégé.
export function echapperHtml(valeur: unknown): string {
  return String(valeur ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Pour un objet d'email : une seule ligne, sans caractères de contrôle. */
export function texteSimple(valeur: unknown, max = 120): string {
  return String(valeur ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
}
