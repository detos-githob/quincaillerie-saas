import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consulterPaiement, raisonLisible } from "./momo.ts";

const DELAI_EXPIRATION_MS = 15 * 60 * 1000;

export interface PaiementAbonnement {
  id: string;
  entreprise_id: string;
  statut: "en_attente" | "reussi" | "echoue" | "expire";
  montant: number;
  devise: string;
  raison_echec: string | null;
  date_expiration_apres: string | null;
  created_at: string;
}

/**
 * Relit le statut RÉEL chez MTN et met à jour le paiement. Appelée par la
 * page de paiement (interrogation régulière), par le rappel MTN et par la
 * réconciliation : on ne fait jamais confiance au contenu d'un rappel ni
 * au navigateur, seulement à la réponse de l'API MTN authentifiée.
 */
export async function synchroniserPaiementMomo(
  admin: SupabaseClient,
  paiement: PaiementAbonnement
): Promise<PaiementAbonnement> {
  if (paiement.statut !== "en_attente" && paiement.statut !== "expire") return paiement;

  const mtn = await consulterPaiement(paiement.id);
  const age = Date.now() - new Date(paiement.created_at).getTime();

  const maj = async (champs: Partial<PaiementAbonnement>) => {
    const { data } = await admin
      .from("paiements_abonnement")
      .update({ ...champs, updated_at: new Date().toISOString() })
      .eq("id", paiement.id)
      .in("statut", ["en_attente", "expire"])
      .select()
      .single();
    return (data as PaiementAbonnement) ?? { ...paiement, ...champs };
  };

  if (!mtn || mtn.status === "PENDING") {
    if (paiement.statut === "en_attente" && age > DELAI_EXPIRATION_MS) {
      return maj({ statut: "expire", raison_echec: "Aucune validation reçue sur le téléphone." });
    }
    return paiement;
  }

  if (mtn.status === "FAILED") {
    return maj({ statut: "echoue", raison_echec: raisonLisible(mtn.reason) });
  }

  // SUCCESSFUL : contrôles de cohérence avant d'appliquer.
  if (mtn.externalId && mtn.externalId !== paiement.id) {
    return maj({ statut: "echoue", raison_echec: "Référence MTN incohérente." });
  }
  if (mtn.currency !== paiement.devise) {
    return maj({ statut: "echoue", raison_echec: `Devise inattendue (${mtn.currency}).` });
  }

  const { data, error } = await admin.rpc("appliquer_paiement_abonnement", {
    p_paiement_id: paiement.id,
    p_montant_confirme: Number(mtn.amount),
    p_reference_fournisseur: mtn.financialTransactionId ?? null,
  });
  if (error) throw error;
  if (data?.erreur) return { ...paiement, statut: "echoue", raison_echec: data.erreur };

  const { data: apres } = await admin.from("paiements_abonnement").select("*").eq("id", paiement.id).single();
  return apres as PaiementAbonnement;
}
