import { supabase } from "../lib/supabaseClient";
import type { Avoir, LigneVente, LigneVenteInput, ModePaiement, TypeFacture, Vente } from "../types";
import {
  ajouterVenteEnAttente,
  listerVentesEnAttente,
  noterEchec,
  retirerVenteEnAttente,
  type VenteEnAttente,
} from "./offlineQueue";
import { estErreurReseau } from "../lib/baseLocale";
import { identifiantAppareil } from "../lib/appareil";
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

const MAX_TENTATIVES_REFUS = 3;

function envoyerVente(vente: VenteEnAttente) {
  return supabase.rpc("synchroniser_vente", {
    p_id_local: vente.id_local,
    p_vendu_le: vente.vendu_le,
    p_appareil_id: identifiantAppareil(),
    ...vente.payload,
  });
}

/**
 * Enregistre une vente. L'identifiant unique et l'heure réelle sont fixés
 * ICI, avant tout envoi : si la connexion coupe pendant la réponse, la
 * vente mise en file sera renvoyée avec le même identifiant et le serveur
 * ne la créera pas une seconde fois.
 */
export async function enregistrerVente(payload: PayloadVente): Promise<ResultatVente> {
  const vente: VenteEnAttente = {
    id_local: crypto.randomUUID(),
    vendu_le: new Date().toISOString(),
    payload: payload as unknown as VenteEnAttente["payload"],
    tentatives: 0,
  };

  const mettreEnFile = async (): Promise<ResultatVente> => {
    await ajouterVenteEnAttente(vente);
    await ajusterStockEnCache(payload.p_lignes);
    return { horsLigne: true };
  };

  if (!navigator.onLine) return mettreEnFile();

  try {
    const { data, error } = await envoyerVente(vente);
    if (error) {
      if (estErreurReseau(error)) return mettreEnFile();
      // Refus du serveur (droits, article inconnu...) : on l'affiche.
      throw error;
    }
    return { horsLigne: false, numeroVente: data?.numero_vente, saisieTardive: !!data?.saisie_tardive };
  } catch (err) {
    if (estErreurReseau(err)) return mettreEnFile();
    throw err;
  }
}

export interface BilanSynchro {
  envoyees: number;
  enAttente: number;
  rejetees: number;
  tardives: number;
  interrompue: boolean;
}

let synchroEnCours: Promise<BilanSynchro> | null = null;

/**
 * Envoie les ventes en attente, dans l'ordre. S'arrête au premier
 * problème réseau (on réessaiera). Une seule synchronisation à la fois
 * dans l'onglet ; entre onglets ou appareils, l'identifiant unique
 * garantit qu'une vente n'est jamais créée deux fois.
 */
export function synchroniserVentesEnAttente(entrepriseId: string): Promise<BilanSynchro> {
  if (!synchroEnCours) {
    synchroEnCours = (async () => {
      const bilan: BilanSynchro = { envoyees: 0, enAttente: 0, rejetees: 0, tardives: 0, interrompue: false };
      const file = await listerVentesEnAttente();
      // Les ventes d'une autre entreprise (autre compte sur cet appareil)
      // attendent que ce compte se reconnecte.
      const aEnvoyer = file.filter((v) => v.payload.p_entreprise_id === entrepriseId);

      for (const vente of aEnvoyer) {
        if (!navigator.onLine) {
          bilan.interrompue = true;
          break;
        }
        try {
          const { data, error } = await envoyerVente(vente);
          if (error) throw error;
          await retirerVenteEnAttente(vente.id_local);
          bilan.envoyees++;
          if (data?.saisie_tardive) bilan.tardives++;
        } catch (err) {
          const e = err as { message?: string; code?: string; status?: number };
          if (estErreurReseau(err) || e.status === 401 || /JWT|token/i.test(e.message ?? "")) {
            // Réseau ou session à rafraîchir : on réessaiera plus tard.
            bilan.interrompue = true;
            break;
          }
          const issue = await noterEchec(vente.id_local, e.message ?? "Refus du serveur", MAX_TENTATIVES_REFUS);
          if (issue === "rejetee") bilan.rejetees++;
        }
      }

      bilan.enAttente = (await listerVentesEnAttente()).length;
      return bilan;
    })().finally(() => {
      synchroEnCours = null;
    });
  }
  return synchroEnCours;
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
