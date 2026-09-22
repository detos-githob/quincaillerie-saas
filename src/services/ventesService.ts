import { supabase } from "../lib/supabaseClient";
import type { Avoir, LigneVente, LigneVenteInput, ModePaiement, TypeFacture, Vente } from "../types";
import {
  ajouterVenteEnAttente,
  listerVentesEnAttente,
  retirerVenteEnAttente,
} from "./offlineQueue";

export interface PayloadVente {
  p_entreprise_id: string;
  p_client_id: string | null;
  p_utilisateur_id: string | null;
  p_mode_paiement: ModePaiement;
  p_lignes: LigneVenteInput[];
  p_type_facture: TypeFacture;
}

export interface ResultatVente {
  horsLigne: boolean;
}

/**
 * Enregistre une vente. Essaie d'abord en ligne (RPC atomique
 * `creer_vente`). Si la requête échoue pour une raison réseau
 * (et seulement dans ce cas), on met la vente en file d'attente
 * locale plutôt que de faire échouer la vente pour le vendeur.
 */
export async function enregistrerVente(payload: PayloadVente): Promise<ResultatVente> {
  try {
    const { error } = await supabase.rpc("creer_vente", payload);
    if (error) {
      // Erreur applicative (ex: contrainte violée) : on ne la masque pas
      // en la mettant en file, on la relance pour que l'UI l'affiche.
      throw error;
    }
    return { horsLigne: false };
  } catch (err) {
    if (!navigator.onLine) {
      ajouterVenteEnAttente(payload);
      return { horsLigne: true };
    }
    throw err;
  }
}

/**
 * À appeler au retour de connexion (voir hook useSyncHorsLigne) :
 * rejoue chaque vente en attente dans l'ordre où elle a été prise.
 */
export async function synchroniserVentesEnAttente(): Promise<{
  reussies: number;
  echouees: number;
}> {
  const enAttente = listerVentesEnAttente();
  let reussies = 0;
  let echouees = 0;

  for (const vente of enAttente) {
    try {
      const { error } = await supabase.rpc(
        "creer_vente",
        vente.payload as PayloadVente
      );
      if (error) throw error;
      retirerVenteEnAttente(vente.id_local);
      reussies++;
    } catch {
      // On garde la vente en file pour la prochaine tentative.
      echouees++;
    }
  }

  return { reussies, echouees };
}

// =====================================================================
// ANNULATION / AVOIR DE VENTE
// =====================================================================

export async function obtenirVente(id: string): Promise<Vente> {
  const { data, error } = await supabase.from("ventes").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Vente;
}

export async function listerLignesVente(venteId: string): Promise<LigneVente[]> {
  const { data, error } = await supabase
    .from("lignes_vente")
    .select("*, article:articles(designation, unite)")
    .eq("vente_id", venteId);
  if (error) throw error;
  return data as unknown as LigneVente[];
}

export async function listerAvoirsVente(venteId: string): Promise<Avoir[]> {
  const { data, error } = await supabase
    .from("avoirs")
    .select("*")
    .eq("vente_id", venteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Avoir[];
}

export async function obtenirAvoir(id: string): Promise<Avoir> {
  const { data, error } = await supabase.from("avoirs").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Avoir;
}

export async function listerQuantitesRetourneesParLigne(venteId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("lignes_avoir")
    .select("ligne_vente_id, quantite, avoir:avoirs!inner(vente_id)")
    .eq("avoir.vente_id", venteId);
  if (error) throw error;
  const totaux: Record<string, number> = {};
  for (const ligne of (data as any[]) || []) {
    totaux[ligne.ligne_vente_id] = (totaux[ligne.ligne_vente_id] || 0) + Number(ligne.quantite);
  }
  return totaux;
}

/**
 * Crée un avoir (annulation totale ou retour partiel) sur une vente :
 * remet en stock les quantités retournées, réduit la créance du client
 * si la vente était à crédit, et referme automatiquement la vente si
 * la totalité de ses lignes a fini par être retournée — via la
 * fonction RPC atomique `creer_avoir_vente`.
 */
export async function creerAvoirVente(
  venteId: string,
  entrepriseId: string,
  motif: string,
  lignes: { ligne_vente_id: string; quantite: number }[],
  utilisateurId: string | null
): Promise<string> {
  const { data, error } = await supabase.rpc("creer_avoir_vente", {
    p_vente_id: venteId,
    p_entreprise_id: entrepriseId,
    p_motif: motif,
    p_lignes: lignes,
    p_utilisateur_id: utilisateurId,
  });
  if (error) throw error;
  return data as string;
}
