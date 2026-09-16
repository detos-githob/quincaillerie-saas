import { supabase } from "../lib/supabaseClient";
import type { Employe, MotifPaiementPersonnel, ModePaiementSortie, PaiementPersonnel } from "../types";

export async function listerEmployes(): Promise<Employe[]> {
  const { data, error } = await supabase
    .from("employes")
    .select("*")
    .eq("actif", true)
    .order("nom", { ascending: true });
  if (error) throw error;
  return data as Employe[];
}

export async function creerEmploye(
  employe: Omit<Employe, "id" | "entreprise_id" | "actif" | "created_at">,
  entrepriseId: string
): Promise<Employe> {
  const { data, error } = await supabase
    .from("employes")
    .insert({ ...employe, entreprise_id: entrepriseId, actif: true })
    .select()
    .single();
  if (error) throw error;
  return data as Employe;
}

export async function modifierEmploye(id: string, champs: Partial<Employe>): Promise<void> {
  const { error } = await supabase.from("employes").update(champs).eq("id", id);
  if (error) throw error;
}

export async function desactiverEmploye(id: string): Promise<void> {
  const { error } = await supabase.from("employes").update({ actif: false }).eq("id", id);
  if (error) throw error;
}

export async function listerPaiementsPersonnel(employeId?: string): Promise<PaiementPersonnel[]> {
  let requete = supabase
    .from("paiements_personnel")
    .select("*, employe:employes(nom, poste)")
    .order("created_at", { ascending: false });
  if (employeId) requete = requete.eq("employe_id", employeId);
  const { data, error } = await requete;
  if (error) throw error;
  return data as unknown as PaiementPersonnel[];
}

/**
 * Enregistre un paiement à un employé (salaire, prime, avance...) avec
 * une quittance numérotée générée atomiquement côté base de données,
 * puis relit la ligne complète (avec le numéro) pour générer le PDF.
 */
export async function enregistrerPaiementPersonnel(
  entrepriseId: string,
  employeId: string,
  montant: number,
  periode: string | null,
  motif: MotifPaiementPersonnel,
  modePaiement: ModePaiementSortie,
  utilisateurId: string | null
): Promise<PaiementPersonnel> {
  const { data: paiementId, error } = await supabase.rpc("enregistrer_paiement_personnel", {
    p_entreprise_id: entrepriseId,
    p_employe_id: employeId,
    p_montant: montant,
    p_periode: periode,
    p_motif: motif,
    p_mode_paiement: modePaiement,
    p_utilisateur_id: utilisateurId,
  });
  if (error) throw error;

  const { data, error: erreurLecture } = await supabase
    .from("paiements_personnel")
    .select("*, employe:employes(nom, poste)")
    .eq("id", paiementId)
    .single();
  if (erreurLecture) throw erreurLecture;
  return data as unknown as PaiementPersonnel;
}
