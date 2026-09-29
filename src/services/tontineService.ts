import { supabase } from "../lib/supabaseClient";
import type { ConditionsTontine, CotisationTontine, LignePanierTontine, Tontine } from "../types";

export async function listerTontines(): Promise<Tontine[]> {
  const { data, error } = await supabase
    .from("tontines")
    .select("*, client:clients(nom, telephone)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data as unknown as Tontine[];
}

export async function obtenirTontine(id: string): Promise<Tontine> {
  const { data, error } = await supabase
    .from("tontines")
    .select("*, client:clients(nom, telephone)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as Tontine;
}

export async function creerTontine(
  entrepriseId: string,
  clientId: string,
  plafond: number,
  utilisateurId: string | null,
  conditionsAcceptees: boolean
): Promise<Tontine> {
  const { data, error } = await supabase
    .from("tontines")
    .insert({
      entreprise_id: entrepriseId,
      client_id: clientId,
      plafond,
      montant_cumule: 0,
      statut: "en_cours",
      utilisateur_id: utilisateurId,
      // Le serveur refuse l'insertion si false, puis fige lui-même le
      // texte, la version et l'horodatage des conditions acceptées.
      conditions_acceptees: conditionsAcceptees,
    })
    .select("*, client:clients(nom, telephone)")
    .single();
  if (error) throw error;
  return data as unknown as Tontine;
}

export async function listerCotisations(tontineId: string): Promise<CotisationTontine[]> {
  const { data, error } = await supabase
    .from("cotisations_tontine")
    .select("*")
    .eq("tontine_id", tontineId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as CotisationTontine[];
}

/**
 * Enregistre une cotisation (versement) sur une tontine : met à jour le
 * cumul et bascule automatiquement le statut sur "atteint" si le
 * plafond est franchi — via la fonction RPC atomique
 * `enregistrer_cotisation_tontine`. Relit ensuite la cotisation complète
 * (avec son numéro de reçu) pour générer le PDF.
 */
export async function enregistrerCotisation(
  tontineId: string,
  entrepriseId: string,
  montant: number,
  modePaiement: "especes" | "mobile_money",
  utilisateurId: string | null
): Promise<CotisationTontine> {
  const { data: cotisationId, error } = await supabase.rpc("enregistrer_cotisation_tontine", {
    p_tontine_id: tontineId,
    p_entreprise_id: entrepriseId,
    p_montant: montant,
    p_mode_paiement: modePaiement,
    p_utilisateur_id: utilisateurId,
  });
  if (error) throw error;

  const { data, error: erreurLecture } = await supabase
    .from("cotisations_tontine")
    .select("*")
    .eq("id", cotisationId)
    .single();
  if (erreurLecture) throw erreurLecture;
  return data as CotisationTontine;
}

export async function listerPanierTontine(tontineId: string): Promise<LignePanierTontine[]> {
  const { data, error } = await supabase
    .from("panier_tontine")
    .select("*, article:articles(designation, unite, prix_vente)")
    .eq("tontine_id", tontineId);
  if (error) throw error;
  return data as unknown as LignePanierTontine[];
}

export async function ajouterProduitPanier(
  tontineId: string,
  entrepriseId: string,
  articleId: string,
  quantite: number
): Promise<void> {
  const { error } = await supabase.rpc("ajouter_produit_panier_tontine", {
    p_tontine_id: tontineId,
    p_entreprise_id: entrepriseId,
    p_article_id: articleId,
    p_quantite: quantite,
  });
  if (error) throw error;
}

export async function retirerProduitPanier(ligneId: string): Promise<void> {
  const { error } = await supabase.from("panier_tontine").delete().eq("id", ligneId);
  if (error) throw error;
}

/**
 * Récupère les produits du panier une fois le plafond atteint : sort la
 * marchandise du stock, vide le panier et clôture la tontine — via la
 * fonction RPC atomique `recuperer_produits_tontine`.
 */
export async function recupererProduitsTontine(
  tontineId: string,
  entrepriseId: string,
  utilisateurId: string | null
): Promise<void> {
  const { error } = await supabase.rpc("recuperer_produits_tontine", {
    p_tontine_id: tontineId,
    p_entreprise_id: entrepriseId,
    p_utilisateur_id: utilisateurId,
  });
  if (error) throw error;
}

// =====================================================================
// CONDITIONS DE TONTINE (définies par le gérant)
// =====================================================================

export const LONGUEUR_MIN_CONDITIONS = 50;
export const LONGUEUR_MAX_CONDITIONS = 10000;

export async function obtenirConditionsTontine(): Promise<ConditionsTontine | null> {
  const { data, error } = await supabase
    .from("conditions_tontine")
    .select("entreprise_id, contenu, version, updated_at")
    .maybeSingle();
  if (error) throw error;
  return (data as ConditionsTontine) ?? null;
}

/**
 * Enregistre les conditions (gérant uniquement, vérifié côté serveur).
 * Renvoie le numéro de version en vigueur après enregistrement.
 */
export async function definirConditionsTontine(contenu: string): Promise<number> {
  const { data, error } = await supabase.rpc("definir_conditions_tontine", { p_contenu: contenu });
  if (error) throw error;
  return data as number;
}
