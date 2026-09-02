import { supabase } from "../lib/supabaseClient";
import type { Client } from "../types";

export async function listerClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("nom", { ascending: true });

  if (error) throw error;
  return data as Client[];
}

export async function creerClient(
  client: Omit<Client, "id" | "entreprise_id" | "solde_credit">,
  entrepriseId: string
): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...client, entreprise_id: entrepriseId, solde_credit: 0 })
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
  soldeActuel: number
): Promise<void> {
  const { error: erreurPaiement } = await supabase.from("paiements").insert({
    entreprise_id: entrepriseId,
    client_id: clientId,
    montant,
    mode_paiement: modePaiement,
  });
  if (erreurPaiement) throw erreurPaiement;

  const { error: erreurClient } = await supabase
    .from("clients")
    .update({ solde_credit: Math.max(0, soldeActuel - montant) })
    .eq("id", clientId);
  if (erreurClient) throw erreurClient;
}

export function clientsAvecCreanceEnRetard(clients: Client[]): Client[] {
  return clients.filter((c) => c.solde_credit > 0);
}
