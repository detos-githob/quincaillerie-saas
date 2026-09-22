import { supabase } from "../lib/supabaseClient";
import type { Article, TableauDecisionnel } from "../types";

export async function obtenirTableauDecisionnel(
  entrepriseId: string,
  joursDormant = 60
): Promise<TableauDecisionnel> {
  const { data, error } = await supabase
    .rpc("tableau_decisionnel", { p_entreprise_id: entrepriseId, p_jours_dormant: joursDormant })
    .single();
  if (error) throw error;
  return data as unknown as TableauDecisionnel;
}

export async function listerStockDormant(entrepriseId: string, joursDormant = 60): Promise<Article[]> {
  const { data, error } = await supabase.rpc("lister_stock_dormant", {
    p_entreprise_id: entrepriseId,
    p_jours_dormant: joursDormant,
  });
  if (error) throw error;
  return data as Article[];
}

export async function listerRuptures(entrepriseId: string): Promise<Article[]> {
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .eq("actif", true)
    .lte("stock_actuel", 0)
    .order("designation", { ascending: true })
    .limit(50);
  if (error) throw error;
  return data as Article[];
}
