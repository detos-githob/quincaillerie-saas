import { supabase } from "../lib/supabaseClient";
import type { Fournisseur } from "../types";

export async function listerFournisseurs(): Promise<Fournisseur[]> {
  const { data, error } = await supabase
    .from("fournisseurs")
    .select("*")
    .eq("actif", true)
    .order("nom");
  if (error) throw error;
  return data as Fournisseur[];
}

export async function creerFournisseur(
  fournisseur: Omit<Fournisseur, "id" | "entreprise_id" | "actif">,
  entrepriseId: string
): Promise<Fournisseur> {
  const { data, error } = await supabase
    .from("fournisseurs")
    .insert({ ...fournisseur, entreprise_id: entrepriseId, actif: true })
    .select()
    .single();
  if (error) throw error;
  return data as Fournisseur;
}

export async function modifierFournisseur(id: string, champs: Partial<Fournisseur>): Promise<void> {
  const { error } = await supabase.from("fournisseurs").update(champs).eq("id", id);
  if (error) throw error;
}

export async function desactiverFournisseur(id: string): Promise<void> {
  const { error } = await supabase.from("fournisseurs").update({ actif: false }).eq("id", id);
  if (error) throw error;
}

/**
 * Réceptionne une livraison fournisseur : ajoute au stock chaque
 * article reçu, en une seule transaction atomique côté base de
 * données (comme pour les ventes et les inventaires).
 */
export async function receptionnerLivraisonFournisseur(
  entrepriseId: string,
  fournisseurId: string,
  utilisateurId: string | null,
  lignes: { article_id: string; quantite: number }[]
): Promise<void> {
  const { error } = await supabase.rpc("receptionner_livraison_fournisseur", {
    p_entreprise_id: entrepriseId,
    p_fournisseur_id: fournisseurId,
    p_utilisateur_id: utilisateurId,
    p_lignes: lignes,
  });
  if (error) throw error;
}
