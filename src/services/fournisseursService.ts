import { supabase } from "../lib/supabaseClient";
import type {
  CommandeFournisseur,
  Fournisseur,
  LigneCommandeFournisseur,
  LigneCommandeFournisseurInput,
} from "../types";

export async function listerFournisseurs(): Promise<Fournisseur[]> {
  const { data, error } = await supabase
    .from("fournisseurs")
    .select("*")
    .eq("actif", true)
    .order("nom", { ascending: true });
  if (error) throw error;
  return data as Fournisseur[];
}

export async function creerFournisseur(
  fournisseur: Omit<Fournisseur, "id" | "entreprise_id" | "solde_du" | "actif" | "created_at">,
  entrepriseId: string
): Promise<Fournisseur> {
  const { data, error } = await supabase
    .from("fournisseurs")
    .insert({ ...fournisseur, entreprise_id: entrepriseId, solde_du: 0, actif: true })
    .select()
    .single();
  if (error) throw error;
  return data as Fournisseur;
}

export async function modifierFournisseur(id: string, champs: Partial<Fournisseur>): Promise<void> {
  const { error } = await supabase.from("fournisseurs").update(champs).eq("id", id);
  if (error) throw error;
}

export async function desactiverFournisseur(id: string): Promise<void> {
  const { error } = await supabase.from("fournisseurs").update({ actif: false }).eq("id", id);
  if (error) throw error;
}

/**
 * Enregistre un règlement fait AU fournisseur (on lui paie tout ou
 * partie de ce qu'on lui doit), et diminue son solde_du d'autant.
 */
export async function enregistrerReglementFournisseur(
  fournisseurId: string,
  montant: number,
  soldeActuel: number
): Promise<void> {
  const { error } = await supabase
    .from("fournisseurs")
    .update({ solde_du: Math.max(0, soldeActuel - montant) })
    .eq("id", fournisseurId);
  if (error) throw error;
}

export async function listerCommandesFournisseur(fournisseurId?: string): Promise<CommandeFournisseur[]> {
  let requete = supabase
    .from("commandes_fournisseur")
    .select("*")
    .order("created_at", { ascending: false });
  if (fournisseurId) requete = requete.eq("fournisseur_id", fournisseurId);
  const { data, error } = await requete;
  if (error) throw error;
  return data as CommandeFournisseur[];
}

export async function obtenirCommandeFournisseur(id: string): Promise<CommandeFournisseur> {
  const { data, error } = await supabase.from("commandes_fournisseur").select("*").eq("id", id).single();
  if (error) throw error;
  return data as CommandeFournisseur;
}

export async function listerLignesCommandeFournisseur(commandeId: string): Promise<LigneCommandeFournisseur[]> {
  const { data, error } = await supabase
    .from("lignes_commande_fournisseur")
    .select("id, commande_id, article_id, quantite_commandee, quantite_recue, prix_achat_unitaire, article:articles(designation, unite)")
    .eq("commande_id", commandeId);
  if (error) throw error;
  return data as unknown as LigneCommandeFournisseur[];
}

/**
 * Crée une commande fournisseur complète (en-tête + lignes) de façon
 * atomique via la fonction RPC `creer_commande_fournisseur`.
 */
export async function creerCommandeFournisseur(
  entrepriseId: string,
  fournisseurId: string,
  utilisateurId: string | null,
  dateReceptionPrevue: string | null,
  lignes: LigneCommandeFournisseurInput[]
): Promise<string> {
  const { data, error } = await supabase.rpc("creer_commande_fournisseur", {
    p_entreprise_id: entrepriseId,
    p_fournisseur_id: fournisseurId,
    p_utilisateur_id: utilisateurId,
    p_date_reception_prevue: dateReceptionPrevue,
    p_lignes: lignes,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Réceptionne (totalement ou partiellement) une commande fournisseur :
 * entre les quantités reçues en stock, met à jour la dette envers le
 * fournisseur et le statut de la commande — via la fonction RPC
 * atomique `receptionner_commande_fournisseur`.
 */
export async function receptionnerCommandeFournisseur(
  commandeId: string,
  utilisateurId: string | null,
  lignes: { ligne_id: string; quantite_recue: number }[]
): Promise<void> {
  const { error } = await supabase.rpc("receptionner_commande_fournisseur", {
    p_commande_id: commandeId,
    p_utilisateur_id: utilisateurId,
    p_lignes: lignes,
  });
  if (error) throw error;
}

export async function annulerCommandeFournisseur(id: string): Promise<void> {
  const { error } = await supabase
    .from("commandes_fournisseur")
    .update({ statut: "annulee" })
    .eq("id", id);
  if (error) throw error;
}

export function fournisseursAvecDette(fournisseurs: Fournisseur[]): Fournisseur[] {
  return fournisseurs.filter((f) => f.solde_du > 0);
}
