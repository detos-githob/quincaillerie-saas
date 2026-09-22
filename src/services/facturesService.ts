import { supabase } from "../lib/supabaseClient";

export interface FactureAvecDetails {
  id: string;
  numero_facture: string;
  type_facture: string;
  statut_emecef: string;
  nim: string | null;
  date_emission: string;
  vente: {
    id: string;
    numero_vente: string;
    montant_total: number;
    mode_paiement: string;
    statut: string;
    client_id: string | null;
    client: { nom: string; ifu: string | null; adresse: string | null } | null;
    lignes_vente: {
      id: string;
      article_id: string;
      quantite: number;
      prix_unitaire: number;
      remise: number;
      montant_ligne: number;
      article: { designation: string; unite: string };
    }[];
  };
}

export async function listerFacturesRecentes(limite = 50): Promise<FactureAvecDetails[]> {
  const { data, error } = await supabase
    .from("factures")
    .select(
      `
      id, numero_facture, type_facture, statut_emecef, nim, date_emission,
      vente:ventes (
        id, numero_vente, montant_total, mode_paiement, statut, client_id,
        client:clients ( nom, ifu, adresse ),
        lignes_vente (
          id, article_id, quantite, prix_unitaire, remise, montant_ligne,
          article:articles ( designation, unite )
        )
      )
    `
    )
    .order("date_emission", { ascending: false })
    .limit(limite);

  if (error) throw error;
  return data as unknown as FactureAvecDetails[];
}
