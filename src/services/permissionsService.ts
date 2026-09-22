import { supabase } from "../lib/supabaseClient";
import type { Module, NiveauAcces } from "../lib/permissions";

/**
 * Charge les surcharges de permissions de l'utilisateur connecté
 * (lignes explicites dans `permissions_utilisateur`), à combiner avec
 * les valeurs par défaut de son rôle via `resoudrePermissions`.
 */
export async function chargerSurchargesUtilisateur(
  utilisateurId: string
): Promise<Partial<Record<Module, NiveauAcces>>> {
  const { data, error } = await supabase
    .from("permissions_utilisateur")
    .select("module, niveau")
    .eq("utilisateur_id", utilisateurId);
  if (error) throw error;
  const surcharges: Partial<Record<Module, NiveauAcces>> = {};
  for (const ligne of data || []) {
    surcharges[ligne.module as Module] = ligne.niveau as NiveauAcces;
  }
  return surcharges;
}

/**
 * Enregistre en une fois toutes les permissions personnalisées d'un
 * membre de l'équipe (snapshot complet) — via la fonction RPC atomique
 * `definir_permissions_utilisateur`, réservée au gérant.
 */
export async function definirPermissionsUtilisateur(
  entrepriseId: string,
  utilisateurId: string,
  permissions: Partial<Record<Module, NiveauAcces>>
): Promise<void> {
  const { error } = await supabase.rpc("definir_permissions_utilisateur", {
    p_entreprise_id: entrepriseId,
    p_utilisateur_id: utilisateurId,
    p_permissions: Object.entries(permissions).map(([module, niveau]) => ({ module, niveau })),
  });
  if (error) throw error;
}
