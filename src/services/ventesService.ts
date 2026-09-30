import { supabase } from "../lib/supabaseClient";
import type { Avoir, LigneVente, LigneVenteInput, ModePaiement, TypeFacture, Vente } from "../types";
import { ajouterOperation, resumeVente, type Operation } from "./offlineQueue";
import { envoyerOperation } from "./synchroHorsLigne";
import { estErreurReseau } from "../lib/baseLocale";
import { ajusterStockEnCache } from "./articlesService";

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
  numeroVente?: string;
  saisieTardive?: boolean;
}

/**
 * Enregistre une vente. L'identifiant unique et l'heure réelle sont fixés
 * ICI, avant tout envoi : si la connexion coupe pendant la réponse, la
 * vente mise en file sera renvoyée avec le même identifiant et le serveur
 * ne la créera pas une seconde fois.
 */
export async function enregistrerVente(payload: PayloadVente): Promise<ResultatVente> {
  const op: Operation = {
    type: "vente",
    id_local: crypto.randomUUID(),
    date: new Date().toISOString(),
    entreprise_id: payload.p_entreprise_id,
    payload: payload as unknown as Extract<Operation, { type: "vente" }>["payload"],
    tentatives: 0,
    ...resumeVente(payload as unknown as Extract<Operation, { type: "vente" }>["payload"]),
  };

  const mettreEnFile = async (): Promise<ResultatVente> => {
    await ajouterOperation(op);
    await ajusterStockEnCache(payload.p_lignes);
    return { horsLigne: true };
  };

  if (!navigator.onLine) return mettreEnFile();
  try {
    const { tardive, donnees } = await envoyerOperation(op);
    return { horsLigne: false, numeroVente: donnees?.numero_vente as string | undefined, saisieTardive: tardive };
  } catch (err) {
    if (estErreurReseau(err)) return mettreEnFile();
    throw err; // refus du serveur : affiché au vendeur
  }
}

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
