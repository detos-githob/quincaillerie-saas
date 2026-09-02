import { supabase } from "../lib/supabaseClient";
import type { LigneVenteInput, ModePaiement } from "../types";
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
