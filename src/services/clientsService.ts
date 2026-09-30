import { supabase } from "../lib/supabaseClient";
import { cleCache, ecrireLocal, estErreurReseau, lireLocal } from "../lib/baseLocale";
import type { Client, MouvementCreance } from "../types";

export async function obtenirClient(id: string): Promise<Client> {
  const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Client;
}

/** Liste les clients ; copie sur l'appareil servie en l'absence de réseau. */
export async function listerClients(): Promise<Client[]> {
  const cle = cleCache("clients");
  try {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("nom", { ascending: true })
      .limit(2000);
    if (error) throw error;
    if (cle) await ecrireLocal(cle, data).catch(() => undefined);
    return data as Client[];
  } catch (err) {
    if (cle && estErreurReseau(err)) {
      const copie = await lireLocal<Client[]>(cle).catch(() => undefined);
      if (copie) return copie;
      return [];
    }
    throw err;
  }
}

export async function creerClient(
  client: Omit<
    Client,
    "id" | "entreprise_id" | "solde_credit" | "solde_consigne_casiers" | "solde_consigne_bouteilles"
  >,
  entrepriseId: string
): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      ...client,
      entreprise_id: entrepriseId,
      solde_credit: 0,
      solde_consigne_casiers: 0,
      solde_consigne_bouteilles: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Client;
}

export async function enregistrerPaiementClient(
  entrepriseId: string,
  clientId: string,
  montant: number,
  modePaiement: "especes" | "mobile_money",
  utilisateurId: string | null
): Promise<void> {
  const { error } = await supabase.rpc("enregistrer_paiement_client", {
    p_entreprise_id: entrepriseId,
    p_client_id: clientId,
    p_montant: montant,
    p_mode_paiement: modePaiement,
    p_utilisateur_id: utilisateurId,
  });
  if (error) throw error;
}

export async function listerMouvementsCreance(clientId: string): Promise<MouvementCreance[]> {
  const { data, error } = await supabase
    .from("mouvements_creance")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as MouvementCreance[];
}

export function clientsAvecCreanceEnRetard(clients: Client[]): Client[] {
  return clients.filter((c) => c.solde_credit > 0);
}
