import { supabase } from "../lib/supabaseClient";
import type { ApercuCloture, Cloture, EtatClotures, TypeCloture } from "../types";

/**
 * Tous les calculs et contrôles sont faits côté serveur (RPC) : le
 * navigateur ne fait qu'afficher. Aucun montant calculé ici n'est
 * envoyé pour être enregistré, seulement ce que le gérant a compté.
 */

export async function obtenirEtatClotures(): Promise<EtatClotures> {
  const { data, error } = await supabase.rpc("etat_clotures");
  if (error) throw error;
  return data as EtatClotures;
}

export async function obtenirApercuCloture(type: TypeCloture, date: string): Promise<ApercuCloture> {
  const { data, error } = await supabase.rpc("apercu_cloture", { p_type: type, p_date: date });
  if (error) throw error;
  return data as ApercuCloture;
}

export async function cloturerPeriode(params: {
  type: TypeCloture;
  date: string;
  especesComptees?: number;
  fondConserve?: number;
  fondOuverture?: number;
  commentaire?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("cloturer_periode", {
    p_type: params.type,
    p_date: params.date,
    p_especes_comptees: params.especesComptees ?? null,
    p_fond_conserve: params.fondConserve ?? null,
    p_fond_ouverture: params.fondOuverture ?? null,
    p_commentaire: params.commentaire?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function rouvrirCloture(id: string, motif: string): Promise<void> {
  const { error } = await supabase.rpc("rouvrir_cloture", { p_cloture_id: id, p_motif: motif.trim() });
  if (error) throw error;
}

export async function listerClotures(type: TypeCloture, limite = 60): Promise<Cloture[]> {
  const { data, error } = await supabase
    .from("clotures")
    .select("*, auteur:utilisateurs!clotures_cloture_par_fkey(nom)")
    .eq("type_cloture", type)
    .order("date_debut", { ascending: false })
    .order("cloture_le", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data as unknown as Cloture[];
}
