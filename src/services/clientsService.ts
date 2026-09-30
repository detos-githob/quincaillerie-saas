import { supabase } from "../lib/supabaseClient";
import { cleCache, ecrireLocal, estErreurReseau, lireLocal } from "../lib/baseLocale";
import { ajouterOperation } from "./offlineQueue";
import type { Client, MouvementCreance } from "../types";

export async function obtenirClient(id: string): Promise<Client> {
  try {
    const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
    if (error) throw error;
    return data as Client;
  } catch (err) {
    const cle = cleCache("clients");
    if (cle && estErreurReseau(err)) {
      const trouve = ((await lireLocal<Client[]>(cle).catch(() => undefined)) ?? []).find((c) => c.id === id);
      if (trouve) return trouve;
    }
    throw err;
  }
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

/**
 * Crée un client. L'identifiant est généré ici : sans réseau, le client
 * est ajouté à la file hors ligne (et à la liste en cache) et sera créé
 * sur le serveur à la synchronisation, avant les ventes ou tontines qui
 * l'utilisent.
 */
export async function creerClient(
  client: Omit<
    Client,
    "id" | "entreprise_id" | "solde_credit" | "solde_consigne_casiers" | "solde_consigne_bouteilles"
  >,
  entrepriseId: string
): Promise<Client> {
  const nouveau = {
    id: crypto.randomUUID(),
    ...client,
    entreprise_id: entrepriseId,
    solde_credit: 0,
    solde_consigne_casiers: 0,
    solde_consigne_bouteilles: 0,
  };

  const horsLigne = async (): Promise<Client> => {
    await ajouterOperation({
      type: "client",
      id_local: nouveau.id,
      date: new Date().toISOString(),
      entreprise_id: entrepriseId,
      resume: `Nouveau client : ${nouveau.nom}`,
      tentatives: 0,
      client: {
        id: nouveau.id,
        entreprise_id: entrepriseId,
        nom: nouveau.nom,
        telephone: nouveau.telephone ?? null,
        adresse: nouveau.adresse ?? null,
        ifu: nouveau.ifu ?? null,
        type_client: String(nouveau.type_client ?? "detail"),
      },
    });
    const cle = cleCache("clients");
    if (cle) {
      const copie = (await lireLocal<Client[]>(cle).catch(() => undefined)) ?? [];
      await ecrireLocal(cle, [...copie, nouveau].sort((a, b) => a.nom.localeCompare(b.nom))).catch(() => undefined);
    }
    return nouveau as Client;
  };

  if (!navigator.onLine) return horsLigne();
  try {
    const { data, error } = await supabase.from("clients").insert(nouveau).select().single();
    if (error) throw error;
    return data as Client;
  } catch (err) {
    if (estErreurReseau(err)) return horsLigne();
    throw err;
  }
}

export async function enregistrerPaiementClient(
  entrepriseId: string,
  clientId: string,
  montant: number,
  modePaiement: "especes" | "mobile_money",
  utilisateurId: string | null
): Promise<void> {
  if (!navigator.onLine) {
    throw new Error("Pas de connexion : l'encaissement d'une créance se fait en ligne pour l'instant.");
  }
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
  const cle = cleCache(`creances:${clientId}`);
  try {
    const { data, error } = await supabase
      .from("mouvements_creance")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (cle) await ecrireLocal(cle, data).catch(() => undefined);
    return data as MouvementCreance[];
  } catch (err) {
    if (estErreurReseau(err)) return (cle ? await lireLocal<MouvementCreance[]>(cle).catch(() => undefined) : undefined) ?? [];
    throw err;
  }
}

export function clientsAvecCreanceEnRetard(clients: Client[]): Client[] {
  return clients.filter((c) => c.solde_credit > 0);
}
