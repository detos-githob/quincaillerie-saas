import { useEffect, useState } from "react";
import { MonitorSmartphone, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { identifiantAppareil } from "../../lib/appareil";
import { EVENEMENT_FILE, listerVentesEnAttente } from "../../services/offlineQueue";

interface AppareilEnRetard {
  appareil_id: string;
  libelle: string;
  utilisateur: string | null;
  operations_en_attente: number;
  derniere_synchro: string;
}

/**
 * Avant de clôturer une journée :
 *   - BLOQUE si cet appareil a encore des ventes non envoyées ;
 *   - AVERTIT si d'autres appareils de l'entreprise n'ont pas
 *     synchronisé depuis la fin de la journée (ils ont peut-être des
 *     ventes hors ligne), sans bloquer : un appareil éteint qui n'a rien
 *     vendu ne doit pas empêcher la clôture.
 */
export function useControleSynchro(entrepriseId: string | undefined, date: string) {
  const [enAttenteIci, setEnAttenteIci] = useState(0);
  const [appareils, setAppareils] = useState<AppareilEnRetard[]>([]);

  useEffect(() => {
    let actif = true;
    const compter = () =>
      listerVentesEnAttente().then((f) => {
        if (actif) setEnAttenteIci(f.filter((v) => v.payload.p_entreprise_id === entrepriseId).length);
      });
    compter();
    window.addEventListener(EVENEMENT_FILE, compter);
    supabase.rpc("appareils_a_synchroniser", { p_date: date }).then(({ data }) => {
      if (actif && data) setAppareils(data as AppareilEnRetard[]);
    });
    return () => {
      actif = false;
      window.removeEventListener(EVENEMENT_FILE, compter);
    };
  }, [entrepriseId, date]);

  // Cet appareil est en ligne maintenant : seules comptent ses ventes
  // encore en file (calculées localement ci-dessus).
  const autres = appareils.filter((a) => a.appareil_id !== identifiantAppareil());
  return { enAttenteIci, autres, bloquant: enAttenteIci > 0 };
}

export function AlerteSynchro({
  enAttenteIci,
  autres,
}: {
  enAttenteIci: number;
  autres: AppareilEnRetard[];
}) {
  if (enAttenteIci === 0 && autres.length === 0) return null;
  return (
    <div className="space-y-2">
      {enAttenteIci > 0 && (
        <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <RefreshCw size={16} className="shrink-0 mt-0.5" />
          <span>
            {enAttenteIci} vente{enAttenteIci > 1 ? "s" : ""} de cet appareil {enAttenteIci > 1 ? "ne sont" : "n'est"} pas
            encore envoyée{enAttenteIci > 1 ? "s" : ""}. Connecte-toi à internet et attends la fin de la
            synchronisation avant de clôturer.
          </span>
        </p>
      )}
      {autres.length > 0 && (
        <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="flex items-center gap-2 font-medium">
            <MonitorSmartphone size={16} className="shrink-0" />
            Appareils pas encore synchronisés
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {autres.map((a) => (
              <li key={a.appareil_id}>
                {a.libelle}
                {a.utilisateur ? ` (${a.utilisateur})` : ""} : dernier contact{" "}
                {new Date(a.derniere_synchro).toLocaleString("fr-FR", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {a.operations_en_attente > 0 ? ` · ${a.operations_en_attente} vente(s) en attente signalée(s)` : ""}
              </li>
            ))}
          </ul>
          <p className="text-xs mt-1.5">
            S'ils ont vendu hors ligne, connecte-les avant de clôturer. Sinon, leurs ventes seront comptées sur la
            prochaine journée ouverte (marquées « saisie tardive »).
          </p>
        </div>
      )}
    </div>
  );
}
