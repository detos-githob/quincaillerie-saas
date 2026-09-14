import { supabase } from "../lib/supabaseClient";
import type { Livraison, StatutLivraison } from "../types";

export interface LivraisonAvecDetails extends Livraison {
  client: { nom: string; telephone: string | null } | null;
  vente: { numero_vente: string; montant_total: number };
}

export async function listerLivraisons(): Promise<LivraisonAvecDetails[]> {
  const { data, error } = await supabase
    .from("livraisons")
    .select(
      "*, client:clients(nom, telephone), vente:ventes(numero_vente, montant_total)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as LivraisonAvecDetails[];
}

export async function changerStatutLivraison(
  id: string,
  statut: StatutLivraison
): Promise<void> {
  const champs: Record<string, unknown> = { statut };
  if (statut === "livree") champs.date_livraison = new Date().toISOString();
  const { error } = await supabase.from("livraisons").update(champs).eq("id", id);
  if (error) throw error;
}
