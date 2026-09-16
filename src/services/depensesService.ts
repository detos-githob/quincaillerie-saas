import { supabase } from "../lib/supabaseClient";
import type { CategorieDepense, Depense, ModePaiementSortie } from "../types";

export async function listerDepenses(): Promise<Depense[]> {
  const { data, error } = await supabase
    .from("depenses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data as Depense[];
}

export async function creerDepense(
  depense: {
    categorie: CategorieDepense;
    description: string | null;
    montant: number;
    mode_paiement: ModePaiementSortie;
  },
  entrepriseId: string,
  utilisateurId: string | null
): Promise<Depense> {
  const { data, error } = await supabase
    .from("depenses")
    .insert({ ...depense, entreprise_id: entrepriseId, utilisateur_id: utilisateurId })
    .select()
    .single();
  if (error) throw error;
  return data as Depense;
}

export async function supprimerDepense(id: string): Promise<void> {
  const { error } = await supabase.from("depenses").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Total des dépenses + paiements personnel du mois en cours — utilisé
 * pour le widget "vision globale" du tableau de bord, commun à tous
 * les secteurs d'activité.
 */
export async function totalSortiesArgentDuMois(entrepriseId: string): Promise<{
  totalDepenses: number;
  totalPersonnel: number;
}> {
  const debutMois = new Date();
  debutMois.setDate(1);
  debutMois.setHours(0, 0, 0, 0);
  const debutMoisStr = debutMois.toISOString();

  const [{ data: depenses }, { data: paiements }] = await Promise.all([
    supabase
      .from("depenses")
      .select("montant")
      .eq("entreprise_id", entrepriseId)
      .gte("created_at", debutMoisStr),
    supabase
      .from("paiements_personnel")
      .select("montant")
      .eq("entreprise_id", entrepriseId)
      .gte("created_at", debutMoisStr),
  ]);

  return {
    totalDepenses: (depenses || []).reduce((s, d: any) => s + Number(d.montant), 0),
    totalPersonnel: (paiements || []).reduce((s, p: any) => s + Number(p.montant), 0),
  };
}
