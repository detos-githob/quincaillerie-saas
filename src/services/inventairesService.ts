import { supabase } from "../lib/supabaseClient";

export interface Inventaire {
  id: string;
  entreprise_id: string;
  depot_id: string | null;
  statut: "en_cours" | "valide" | "annule";
  date_debut: string;
  date_fin: string | null;
  utilisateur_id: string | null;
}

export interface LigneInventaire {
  id: string;
  inventaire_id: string;
  article_id: string;
  quantite_theorique: number;
  quantite_comptee: number | null;
  ecart: number | null;
  article: { designation: string; unite: string };
}

export async function listerInventaires(): Promise<Inventaire[]> {
  const { data, error } = await supabase
    .from("inventaires")
    .select("*")
    .order("date_debut", { ascending: false });
  if (error) throw error;
  return data as Inventaire[];
}

/**
 * Démarre un nouvel inventaire : fige le stock théorique de chaque
 * article actif au moment T. Opération atomique côté base de données
 * (fonction demarrer_inventaire), pour éviter un inventaire à moitié
 * créé en cas de coupure réseau au milieu de l'opération.
 */
export async function demarrerInventaire(
  entrepriseId: string,
  utilisateurId: string | null,
  depotId: string | null = null
): Promise<string> {
  const { data, error } = await supabase.rpc("demarrer_inventaire", {
    p_entreprise_id: entrepriseId,
    p_utilisateur_id: utilisateurId,
    p_depot_id: depotId,
  });
  if (error) throw error;
  return data as string;
}

export async function obtenirInventaire(id: string): Promise<Inventaire> {
  const { data, error } = await supabase.from("inventaires").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Inventaire;
}

export async function listerLignesInventaire(inventaireId: string): Promise<LigneInventaire[]> {
  const { data, error } = await supabase
    .from("lignes_inventaire")
    .select("id, inventaire_id, article_id, quantite_theorique, quantite_comptee, ecart, article:articles(designation, unite)")
    .eq("inventaire_id", inventaireId);
  if (error) throw error;
  return data as unknown as LigneInventaire[];
}

export async function enregistrerComptage(ligneId: string, quantite: number | null): Promise<void> {
  const { error } = await supabase
    .from("lignes_inventaire")
    .update({ quantite_comptee: quantite })
    .eq("id", ligneId);
  if (error) throw error;
}

/**
 * Valide l'inventaire : applique chaque écart saisi comme mouvement de
 * stock et ajuste le stock réel des articles concernés, en une seule
 * transaction atomique (fonction valider_inventaire).
 */
export async function validerInventaire(
  inventaireId: string,
  utilisateurId: string | null
): Promise<void> {
  const { error } = await supabase.rpc("valider_inventaire", {
    p_inventaire_id: inventaireId,
    p_utilisateur_id: utilisateurId,
  });
  if (error) throw error;
}
