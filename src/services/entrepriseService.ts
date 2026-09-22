import { supabase } from "../lib/supabaseClient";
import type { SecteurActivite } from "../types";

/**
 * Met à jour la liste des secteurs actifs simultanément pour
 * l'entreprise (gestion multi-activités). Le secteur principal
 * (secteur_activite) est toujours forcé dans la liste, même si le
 * gérant oublie de le cocher — il reste la référence pour la
 * personnalisation par défaut du tableau de bord.
 */
export async function modifierSecteursActifs(
  entrepriseId: string,
  secteurPrincipal: SecteurActivite,
  secteursActifs: SecteurActivite[]
): Promise<void> {
  const ensemble = new Set(secteursActifs);
  ensemble.add(secteurPrincipal);
  const { error } = await supabase
    .from("entreprises")
    .update({ secteurs_actifs: Array.from(ensemble) })
    .eq("id", entrepriseId);
  if (error) throw error;
}
