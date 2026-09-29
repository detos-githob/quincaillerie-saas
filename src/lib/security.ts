export const POLITIQUE_MOT_DE_PASSE = {
  longueurMinimale: 12,
  longueurMaximale: 72,
  ageMaxJours: 30,
} as const;

const CARACTERE_SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|<>?,./`~]/;

export function validerMotDePasse(motDePasse: string): string | null {
  if (motDePasse.length < POLITIQUE_MOT_DE_PASSE.longueurMinimale) {
    return `Le mot de passe doit contenir au moins ${POLITIQUE_MOT_DE_PASSE.longueurMinimale} caractères.`;
  }
  if (motDePasse.length > POLITIQUE_MOT_DE_PASSE.longueurMaximale) {
    return `Le mot de passe ne peut pas dépasser ${POLITIQUE_MOT_DE_PASSE.longueurMaximale} caractères.`;
  }
  if (!/[A-Z]/.test(motDePasse)) return "Le mot de passe doit contenir au moins une majuscule.";
  if (!/[a-z]/.test(motDePasse)) return "Le mot de passe doit contenir au moins une minuscule.";
  if (!/[0-9]/.test(motDePasse)) return "Le mot de passe doit contenir au moins un chiffre.";
  if (!CARACTERE_SPECIAL.test(motDePasse)) return "Le mot de passe doit contenir au moins un caractère spécial.";
  return null;
}

export function motDePasseDoitEtreRenouvele(dateChangement: string | null | undefined): boolean {
  if (!dateChangement) return true;
  const limite = Date.now() - POLITIQUE_MOT_DE_PASSE.ageMaxJours * 24 * 60 * 60 * 1000;
  return new Date(dateChangement).getTime() <= limite;
}
