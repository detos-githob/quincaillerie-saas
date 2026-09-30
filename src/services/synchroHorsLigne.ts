/**
 * Envoi des opérations faites hors ligne, dans l'ordre.
 */
import { supabase } from "../lib/supabaseClient";
import { estErreurReseau } from "../lib/baseLocale";
import { identifiantAppareil } from "../lib/appareil";
import { listerOperations, noterEchec, retirerOperation, type Operation } from "./offlineQueue";

const MAX_TENTATIVES_REFUS = 3;

export interface BilanSynchro {
  envoyees: number;
  enAttente: number;
  rejetees: number;
  tardives: number;
  interrompue: boolean;
}

/** Envoie UNE opération. Idempotent : renvoyer la même ne crée rien de plus. */
export async function envoyerOperation(op: Operation): Promise<{ tardive: boolean; donnees?: Record<string, unknown> }> {
  if (op.type === "vente") {
    const { data, error } = await supabase.rpc("synchroniser_vente", {
      p_id_local: op.id_local,
      p_vendu_le: op.date,
      p_appareil_id: identifiantAppareil(),
      ...op.payload,
    });
    if (error) throw error;
    return { tardive: !!data?.saisie_tardive, donnees: data };
  }
  if (op.type === "cotisation") {
    const { data, error } = await supabase.rpc("synchroniser_cotisation", {
      p_id_local: op.id_local,
      p_verse_le: op.date,
      p_appareil_id: identifiantAppareil(),
      p_tontine_id: op.cotisation.tontine_id,
      p_entreprise_id: op.entreprise_id,
      p_montant: op.cotisation.montant,
      p_mode_paiement: op.cotisation.mode_paiement,
    });
    if (error) throw error;
    return { tardive: !!data?.saisie_tardive, donnees: data };
  }
  if (op.type === "client") {
    // Identifiant créé sur l'appareil : « ne rien faire s'il existe déjà ».
    const { error } = await supabase
      .from("clients")
      .upsert(
        { ...op.client, solde_credit: 0, solde_consigne_casiers: 0, solde_consigne_bouteilles: 0 },
        { onConflict: "id", ignoreDuplicates: true }
      );
    if (error) throw error;
    return { tardive: false };
  }
  // tontine
  const { error } = await supabase.from("tontines").upsert(
    {
      ...op.tontine,
      montant_cumule: 0,
      statut: "en_cours",
      // Le serveur fige lui-même le texte des conditions en vigueur.
      conditions_acceptees: true,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) throw error;
  return { tardive: false };
}

let synchroEnCours: Promise<BilanSynchro> | null = null;

export function synchroniserOperations(entrepriseId: string): Promise<BilanSynchro> {
  if (!synchroEnCours) {
    synchroEnCours = (async () => {
      const bilan: BilanSynchro = { envoyees: 0, enAttente: 0, rejetees: 0, tardives: 0, interrompue: false };
      // Les opérations d'une autre entreprise (autre compte sur cet
      // appareil) attendent que ce compte se reconnecte.
      const aEnvoyer = (await listerOperations()).filter((o) => o.entreprise_id === entrepriseId);

      for (const op of aEnvoyer) {
        if (!navigator.onLine) {
          bilan.interrompue = true;
          break;
        }
        try {
          const { tardive } = await envoyerOperation(op);
          await retirerOperation(op.id_local);
          bilan.envoyees++;
          if (tardive) bilan.tardives++;
        } catch (err) {
          const e = err as { message?: string; status?: number };
          if (estErreurReseau(err) || e.status === 401 || /JWT|jwt expired/i.test(e.message ?? "")) {
            bilan.interrompue = true; // on réessaiera
            break;
          }
          const issue = await noterEchec(op.id_local, e.message ?? "Refus du serveur", MAX_TENTATIVES_REFUS);
          if (issue === "rejetee") bilan.rejetees++;
        }
      }

      bilan.enAttente = (await listerOperations()).filter((o) => o.entreprise_id === entrepriseId).length;
      return bilan;
    })().finally(() => {
      synchroEnCours = null;
    });
  }
  return synchroEnCours;
}
