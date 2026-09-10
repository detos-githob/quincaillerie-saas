import { supabase } from "../lib/supabaseClient";

export async function changerTypeFacture(
  factureId: string,
  nouveauType: "simple" | "normalisee"
): Promise<void> {
  const { error } = await supabase.rpc("changer_type_facture", {
    p_facture_id: factureId,
    p_nouveau_type: nouveauType,
  });
  if (error) throw error;
}
