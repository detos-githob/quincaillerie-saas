import { supabase } from "../lib/supabaseClient";
import type { Consigne } from "../types";

export interface ConsigneAvecDetails extends Consigne {
  client: { nom: string; telephone: string | null } | null;
  article: { designation: string; unite: string };
}

export async function listerConsignesEnCours(): Promise<ConsigneAvecDetails[]> {
  const { data, error } = await supabase
    .from("consignes")
    .select("*, client:clients(nom, telephone), article:articles(designation, unite)")
    .eq("statut", "en_cours")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as unknown as ConsigneAvecDetails[];
}

/**
 * Solde une consigne indépendamment d'une nouvelle vente (le client
 * revient juste rendre ses casiers vides). Incrémente le stock de
 * vides et marque la consigne comme réglée, atomiquement.
 */
export async function solderConsigneManuelle(consigneId: string, quantite: number): Promise<void> {
  const { error } = await supabase.rpc("solder_consigne_manuelle", {
    p_consigne_id: consigneId,
    p_quantite: quantite,
  });
  if (error) throw error;
}
