import { supabase } from "../lib/supabaseClient";

/**
 * Envoie l'email de réinitialisation. Ne révèle JAMAIS si l'email
 * existe : l'appelant affiche toujours le même message, que le compte
 * existe ou non (protection contre l'énumération des comptes). Seules
 * les erreurs de limitation de débit sont remontées.
 */
export async function demanderReinitialisationMotDePasse(email: string): Promise<{ erreur: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
  });
  if (error && (error.status === 429 || /rate limit|security purposes/i.test(error.message))) {
    return { erreur: "Trop de demandes. Patiente quelques minutes avant de réessayer." };
  }
  return { erreur: null };
}

/**
 * Définit le nouveau mot de passe (session de récupération active), puis
 * révoque toutes les AUTRES sessions : si le compte était compromis,
 * l'intrus est déconnecté partout.
 */
export async function definirNouveauMotDePasse(motDePasse: string): Promise<{ erreur: string | null }> {
  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  if (error) {
    if (/should be different|same as the old/i.test(error.message)) {
      return { erreur: "Le nouveau mot de passe doit être différent de l'ancien." };
    }
    if (/weak|pwned|leaked/i.test(error.message)) {
      return { erreur: "Ce mot de passe est trop faible ou connu dans des fuites de données. Choisis-en un autre." };
    }
    if (/session|jwt|expired/i.test(error.message)) {
      return { erreur: "Le lien a expiré. Fais une nouvelle demande de réinitialisation." };
    }
    return { erreur: "Impossible de modifier le mot de passe. Réessaie dans un instant." };
  }
  await supabase.auth.signOut({ scope: "others" });
  return { erreur: null };
}
