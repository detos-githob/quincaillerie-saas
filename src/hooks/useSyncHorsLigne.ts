import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./useAuth";
import { identifiantAppareil, libelleAppareil } from "../lib/appareil";
import { EVENEMENT_FILE, listerOperations, listerOperationsRejetees } from "../services/offlineQueue";
import { synchroniserOperations, type BilanSynchro } from "../services/synchroHorsLigne";

const INTERVALLE_SYNCHRO_MS = 30_000;
const INTERVALLE_SIGNAL_MS = 5 * 60_000;

/**
 * Synchronisation automatique des ventes faites hors ligne :
 *   - dès le retour du réseau, puis toutes les 30 s tant qu'il reste
 *     des ventes en attente ;
 *   - signale l'appareil au serveur (dernière synchro, ventes en
 *     attente) pour que le gérant le voie avant de clôturer.
 */
export function useSyncHorsLigne() {
  const { entreprise, session } = useAuth();
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [nombreEnAttente, setNombreEnAttente] = useState(0);
  const [nombreRejetees, setNombreRejetees] = useState(0);
  const [synchroEnCours, setSynchroEnCours] = useState(false);
  const [dernierBilan, setDernierBilan] = useState<BilanSynchro | null>(null);
  const dernierSignal = useRef(0);

  const rafraichirCompteur = useCallback(async () => {
    const [file, rejets] = await Promise.all([listerOperations(), listerOperationsRejetees()]);
    const ent = entreprise?.id;
    setNombreEnAttente(ent ? file.filter((o) => o.entreprise_id === ent).length : file.length);
    setNombreRejetees(ent ? rejets.filter((o) => o.entreprise_id === ent).length : rejets.length);
    return file.length;
  }, [entreprise?.id]);

  const signalerAppareil = useCallback(async (enAttente: number, force: boolean) => {
    if (!force && Date.now() - dernierSignal.current < INTERVALLE_SIGNAL_MS) return;
    const { error } = await supabase.rpc("signaler_appareil", {
      p_appareil_id: identifiantAppareil(),
      p_libelle: libelleAppareil(),
      p_en_attente: enAttente,
    });
    if (!error) dernierSignal.current = Date.now();
  }, []);

  const synchroniser = useCallback(async () => {
    if (!navigator.onLine || !entreprise?.id || !session) return;
    setSynchroEnCours(true);
    try {
      const avant = await rafraichirCompteur();
      const bilan = await synchroniserOperations(entreprise.id);
      await rafraichirCompteur();
      if (bilan.envoyees > 0 || bilan.rejetees > 0) setDernierBilan(bilan);
      await signalerAppareil(bilan.enAttente, avant > 0);
    } catch (e) {
      console.error("Synchronisation hors ligne", e);
    } finally {
      setSynchroEnCours(false);
    }
  }, [entreprise?.id, session, rafraichirCompteur, signalerAppareil]);

  useEffect(() => {
    rafraichirCompteur();
    synchroniser();

    function gererRetourEnLigne() {
      setEnLigne(true);
      // Laisse le temps à Supabase de renouveler la session.
      setTimeout(synchroniser, 1500);
    }
    function gererPerteReseau() {
      setEnLigne(false);
    }
    function gererFileModifiee() {
      rafraichirCompteur();
    }

    window.addEventListener("online", gererRetourEnLigne);
    window.addEventListener("offline", gererPerteReseau);
    window.addEventListener(EVENEMENT_FILE, gererFileModifiee);
    // Filet de sécurité : l'événement « online » n'est pas toujours émis
    // (réseau présent mais sans internet, veille de l'appareil...).
    const intervalle = setInterval(synchroniser, INTERVALLE_SYNCHRO_MS);

    return () => {
      window.removeEventListener("online", gererRetourEnLigne);
      window.removeEventListener("offline", gererPerteReseau);
      window.removeEventListener(EVENEMENT_FILE, gererFileModifiee);
      clearInterval(intervalle);
    };
  }, [synchroniser, rafraichirCompteur]);

  return {
    enLigne,
    nombreEnAttente,
    nombreRejetees,
    synchroEnCours,
    dernierBilan,
    effacerBilan: () => setDernierBilan(null),
    synchroniser,
  };
}
