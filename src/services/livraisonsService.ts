import { supabase } from "../lib/supabaseClient";
import type { Livraison, StatutLivraison } from "../types";

export async function listerLivraisons(): Promise<Livraison[]> {
  const { data, error } = await supabase
    .from("livraisons")
    .select("*, client:clients(nom, telephone)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as Livraison[];
}

export async function creerLivraison(
  livraison: {
    vente_id: string | null;
    client_id: string | null;
    adresse_livraison: string | null;
    date_prevue: string | null;
    livreur_nom: string | null;
    livreur_telephone: string | null;
    notes: string | null;
  },
  entrepriseId: string,
  utilisateurId: string | null
): Promise<Livraison> {
  const { data, error } = await supabase
    .from("livraisons")
    .insert({
      ...livraison,
      entreprise_id: entrepriseId,
      utilisateur_id: utilisateurId,
      statut: "en_attente",
    })
    .select("*, client:clients(nom, telephone)")
    .single();
  if (error) throw error;
  return data as unknown as Livraison;
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

export async function assignerLivreur(
  id: string,
  livreurNom: string,
  livreurTelephone: string | null
): Promise<void> {
  const { error } = await supabase
    .from("livraisons")
    .update({ livreur_nom: livreurNom, livreur_telephone: livreurTelephone })
    .eq("id", id);
  if (error) throw error;
}

export function livraisonsEnCours(livraisons: Livraison[]): Livraison[] {
  return livraisons.filter((l) => l.statut === "en_attente" || l.statut === "en_cours");
}
