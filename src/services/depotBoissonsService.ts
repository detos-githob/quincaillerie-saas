import { supabase } from "../lib/supabaseClient";
import type { Casse, MouvementConsigne, TypeMouvementConsigne } from "../types";

export async function listerMouvementsConsigne(clientId?: string): Promise<MouvementConsigne[]> {
  let requete = supabase
    .from("mouvements_consigne")
    .select("*, client:clients(nom), article:articles(designation)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (clientId) requete = requete.eq("client_id", clientId);
  const { data, error } = await requete;
  if (error) throw error;
  return data as unknown as MouvementConsigne[];
}

/**
 * Enregistre un mouvement de consigne (sortie, retour ou rachat) pour
 * un client et met à jour son solde de consigne — via la fonction RPC
 * atomique `enregistrer_mouvement_consigne`.
 */
export async function enregistrerMouvementConsigne(
  entrepriseId: string,
  clientId: string,
  articleId: string | null,
  typeMouvement: TypeMouvementConsigne,
  quantiteCasiers: number,
  quantiteBouteilles: number,
  montant: number,
  utilisateurId: string | null
): Promise<string> {
  const { data, error } = await supabase.rpc("enregistrer_mouvement_consigne", {
    p_entreprise_id: entrepriseId,
    p_client_id: clientId,
    p_article_id: articleId,
    p_type_mouvement: typeMouvement,
    p_quantite_casiers: quantiteCasiers,
    p_quantite_bouteilles: quantiteBouteilles,
    p_montant: montant,
    p_utilisateur_id: utilisateurId,
  });
  if (error) throw error;
  return data as string;
}

export async function listerCasses(): Promise<Casse[]> {
  const { data, error } = await supabase
    .from("casses")
    .select("*, article:articles(designation)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as unknown as Casse[];
}

/**
 * Déclare une casse (bouteilles et/ou casiers cassés) : sort la
 * quantité du stock et journalise la perte — via la fonction RPC
 * atomique `enregistrer_casse`.
 */
export async function enregistrerCasse(
  entrepriseId: string,
  articleId: string,
  quantiteBouteilles: number,
  quantiteCasiers: number,
  motif: string | null,
  utilisateurId: string | null
): Promise<string> {
  const { data, error } = await supabase.rpc("enregistrer_casse", {
    p_entreprise_id: entrepriseId,
    p_article_id: articleId,
    p_quantite_bouteilles: quantiteBouteilles,
    p_quantite_casiers: quantiteCasiers,
    p_motif: motif,
    p_utilisateur_id: utilisateurId,
  });
  if (error) throw error;
  return data as string;
}
