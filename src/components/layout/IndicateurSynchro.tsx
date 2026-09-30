import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Wifi, WifiOff, X } from "lucide-react";
import { useSyncHorsLigne } from "../../hooks/useSyncHorsLigne";
import {
  listerOperationsRejetees,
  relancerOperationRejetee,
  retirerOperationRejetee,
  type OperationRejetee,
} from "../../services/offlineQueue";

type Sync = ReturnType<typeof useSyncHorsLigne>;

/**
 * Pastille d'état réseau / synchronisation dans la barre du haut, et
 * panneau de détail. Reçoit l'état du hook (une seule instance dans
 * l'app, portée par AppShell).
 */
export function IndicateurSynchro({ sync }: { sync: Sync }) {
  const { enLigne, nombreEnAttente, nombreRejetees, synchroEnCours, dernierBilan, effacerBilan, synchroniser } = sync;
  const [ouvert, setOuvert] = useState(false);

  // Message après une synchronisation qui a envoyé ou refusé des ventes.
  useEffect(() => {
    if (!dernierBilan) return;
    const minuterie = setTimeout(effacerBilan, 8000);
    return () => clearTimeout(minuterie);
  }, [dernierBilan, effacerBilan]);

  const alerte = nombreRejetees > 0;
  const texte = !enLigne
    ? `Hors ligne${nombreEnAttente > 0 ? ` · ${nombreEnAttente} en attente` : ""}`
    : synchroEnCours && nombreEnAttente > 0
      ? `Envoi · ${nombreEnAttente}`
      : nombreEnAttente > 0
        ? `${nombreEnAttente} en attente`
        : "Synchronisé";

  return (
    <>
      <button
        onClick={() => setOuvert(true)}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded ${alerte ? "bg-red-600" : "bg-navy-800"}`}
        aria-label={`État de la synchronisation : ${texte}`}
      >
        {alerte ? (
          <AlertTriangle size={14} className="text-white" />
        ) : !enLigne ? (
          <WifiOff size={14} className="text-amber-400" />
        ) : synchroEnCours && nombreEnAttente > 0 ? (
          <RefreshCw size={14} className="text-amber-300 animate-spin" />
        ) : (
          <Wifi size={14} className={nombreEnAttente > 0 ? "text-amber-400" : "text-emerald-400"} />
        )}
        <span className={`${alerte ? "text-white" : "text-stone-300"} ${nombreEnAttente > 0 || alerte ? "" : "hidden sm:inline"}`}>
          {alerte ? `${nombreRejetees} à vérifier` : texte}
        </span>
      </button>

      {dernierBilan && !ouvert && (
        <div className="fixed top-16 right-3 z-50 max-w-xs bg-white border border-stone-200 shadow-lg rounded-xl p-3 text-sm text-stone-700 print:hidden">
          {dernierBilan.envoyees > 0 && (
            <p className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              {dernierBilan.envoyees} opération{dernierBilan.envoyees > 1 ? "s" : ""} hors ligne envoyée
              {dernierBilan.envoyees > 1 ? "s" : ""}.
            </p>
          )}
          {dernierBilan.tardives > 0 && (
            <p className="text-xs text-amber-800 mt-1">
              {dernierBilan.tardives} datée{dernierBilan.tardives > 1 ? "s" : ""} d'une journée déjà clôturée :
              comptée{dernierBilan.tardives > 1 ? "s" : ""} aujourd'hui.
            </p>
          )}
          {dernierBilan.rejetees > 0 && (
            <p className="text-xs text-red-700 mt-1">
              {dernierBilan.rejetees} refusée{dernierBilan.rejetees > 1 ? "s" : ""} par le serveur : touche la pastille
              rouge pour les voir.
            </p>
          )}
        </div>
      )}

      {ouvert && (
        <PanneauSynchro
          enLigne={enLigne}
          nombreEnAttente={nombreEnAttente}
          synchroEnCours={synchroEnCours}
          onSynchroniser={synchroniser}
          onFerme={() => setOuvert(false)}
        />
      )}
    </>
  );
}

function PanneauSynchro({
  enLigne,
  nombreEnAttente,
  synchroEnCours,
  onSynchroniser,
  onFerme,
}: {
  enLigne: boolean;
  nombreEnAttente: number;
  synchroEnCours: boolean;
  onSynchroniser: () => Promise<void>;
  onFerme: () => void;
}) {
  const [rejets, setRejets] = useState<OperationRejetee[]>([]);

  const recharger = () => listerOperationsRejetees().then(setRejets);
  useEffect(() => {
    recharger();
  }, [nombreEnAttente]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center sm:justify-end px-3 pt-16 print:hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy/30" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-4 shadow-xl text-stone-900 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display text-lg font-bold">Synchronisation</p>
          <button onClick={onFerme} className="p-1 text-stone-400" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-1.5 text-sm">
          <p className="flex justify-between">
            <span className="text-stone-500">Connexion</span>
            <span className={enLigne ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
              {enLigne ? "En ligne" : "Hors ligne"}
            </span>
          </p>
          <p className="flex justify-between">
            <span className="text-stone-500">Opérations en attente sur cet appareil</span>
            <span className="font-semibold tabular-nums">{nombreEnAttente}</span>
          </p>
        </div>

        {!enLigne && (
          <p className="text-xs text-stone-500 mt-3">
            Tu peux continuer à vendre et à encaisser les tontines. Tout est gardé sur cet appareil et partiront automatiquement dès que la
            connexion reviendra. Pense à te connecter avant de clôturer la journée.
          </p>
        )}

        <button
          onClick={onSynchroniser}
          disabled={!enLigne || synchroEnCours || nombreEnAttente === 0}
          className="w-full mt-3 flex items-center justify-center gap-2 bg-navy text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-40"
        >
          <RefreshCw size={15} className={synchroEnCours ? "animate-spin" : ""} />
          {synchroEnCours ? "Envoi en cours…" : "Synchroniser maintenant"}
        </button>

        {rejets.length > 0 && (
          <section className="mt-4 border-t border-stone-100 pt-3">
            <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
              <AlertTriangle size={15} /> Opérations refusées par le serveur
            </p>
            <p className="text-xs text-stone-500 mt-1">
              Ces opérations ont été faites mais n'ont pas pu être enregistrées. Corrige la cause (ex : article
              supprimé, tontine clôturée, compte désactivé) puis relance, ou ressaisis-la puis retire-la de cette
              liste.
            </p>
            <ul className="mt-2 space-y-2">
              {rejets.map((r) => {
                return (
                  <li key={r.id_local} className="border border-stone-200 rounded-lg p-2.5 text-xs">
                    <p className="font-medium text-stone-900">
                      {new Date(r.date).toLocaleString("fr-FR")}
                      {r.montant !== undefined ? ` · ${Math.round(r.montant).toLocaleString("fr-FR")} F` : ""}
                    </p>
                    <p className="text-stone-500 mt-0.5">{r.resume}</p>
                    <p className="text-red-600 mt-0.5">{r.derniere_erreur}</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={async () => {
                          await relancerOperationRejetee(r.id_local);
                          await recharger();
                          onSynchroniser();
                        }}
                        className="flex-1 border border-stone-300 rounded-md py-1.5 font-medium"
                      >
                        Relancer
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm("Retirer cette opération de l'appareil ? Fais-le seulement si tu l'as ressaisie.")) return;
                          await retirerOperationRejetee(r.id_local);
                          await recharger();
                        }}
                        className="flex-1 border border-stone-300 rounded-md py-1.5 text-stone-600"
                      >
                        Retirer
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
