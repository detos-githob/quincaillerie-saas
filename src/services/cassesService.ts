import { supabase } from "../lib/supabaseClient";
import type { Casse } from "../types";

export interface CasseAvecDetails extends Casse {
  article: { designation: string; unite: string };
}

export async function listerCassesRecentes(limite = 30): Promise<CasseAvecDetails[]> {
  const { data, error } = await supabase
    .from("casses")
    .select("*, article:articles(designation, unite)")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data as unknown as CasseAvecDetails[];
}

/**
 * Enregistre une casse : sort la quantité du stock (casiers pleins) de
 * façon atomique, avec traçabilité du motif.
 */
export async function enregistrerCasse(
  entrepriseId: string,
  articleId: string,
  quantite: number,
  motif: string,
  utilisateurId: string | null
): Promise<void> {
  const { error } = await supabase.rpc("enregistrer_casse", {
    p_entreprise_id: entrepriseId,
    p_article_id: articleId,
    p_quantite: quantite,
    p_motif: motif,
    p_utilisateur_id: utilisateurId,
  });
  if (error) throw error;
}
