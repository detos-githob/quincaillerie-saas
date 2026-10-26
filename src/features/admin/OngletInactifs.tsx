import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import {
  listerEntreprisesInactives,
  listerJournalSuppressions,
  supprimerEntrepriseInactive,
  type EntrepriseInactive,
  type SuppressionJournal,
} from "../../services/plateformePaiementsService";

const SEUILS = [30, 60, 90, 180];

function date(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "jamais";
}

export function OngletInactifs() {
  const [jours, setJours] = useState(30);
  const [liste, setListe] = useState<EntrepriseInactive[] | null>(null);
  const [journal, setJournal] = useState<SuppressionJournal[]>([]);
  const [cible, setCible] = useState<EntrepriseInactive | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = (j = jours) => {
    setListe(null);
    Promise.all([listerEntreprisesInactives(j), listerJournalSuppressions()])
      .then(([l, jr]) => {
        setListe(l);
        setJournal(jr);
      })
      .catch((e) => setErreur(e.message));
  };

  useEffect(() => {
    charger(jours);
  }, [jours]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600 max-w-xl">
        Comptes suspendus ou dont l'abonnement (ou l'essai) a expiré. La suppression efface définitivement toutes les données
        de l'entreprise (ventes, stock, clients, factures…) et les comptes de connexion de ses membres.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-stone-500">Expiré depuis au moins</span>
        {SEUILS.map((s) => (
          <button key={s} onClick={() => setJours(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${jours === s ? "bg-navy text-white border-navy" : "bg-white text-stone-600 border-stone-300"}`}>
            {s} jours
          </button>
        ))}
      </div>

      {message && <p className="text-sm bg-emerald-50 text-emerald-800 rounded-lg px-3 py-2">{message}</p>}
      {erreur && <p className="text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2">{erreur}</p>}

      {!liste ? (
        <p className="text-sm text-stone-400">Chargement…</p>
      ) : liste.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-6 text-center text-sm text-stone-500">Aucun compte inactif selon ce critère.</div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {liste.map((e) => {
            const supprimable = !e.actif || (e.jours_depuis_expiration ?? 0) >= 30;
            return (
              <div key={e.id} className="p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-stone-900">{e.nom}</p>
                    {!e.actif && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700">Suspendu</span>}
                    {e.jours_depuis_expiration !== null && e.jours_depuis_expiration > 0 && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700">Expiré depuis {e.jours_depuis_expiration} j</span>
                    )}
                    <span className="text-[10px] text-stone-400">{e.plan_abonnement}</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1 tabular-nums">
                    {e.nb_utilisateurs} membre{e.nb_utilisateurs > 1 ? "s" : ""} · {e.nb_ventes} vente{e.nb_ventes > 1 ? "s" : ""} · dernière vente : {date(e.derniere_vente)} · dernière connexion : {date(e.derniere_connexion)}
                  </p>
                  {(e.telephone || e.email) && <p className="text-[11px] text-stone-400">{[e.telephone, e.email].filter(Boolean).join(" · ")}</p>}
                </div>
                <button
                  onClick={() => { setMessage(null); setErreur(null); setCible(e); }}
                  disabled={!supprimable}
                  title={supprimable ? "Supprimer définitivement" : "Suppression possible 30 jours après l'expiration"}
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 size={13} /> Supprimer
                </button>
              </div>
            );
          })}
        </div>
      )}

      {journal.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-stone-900 mb-2">Dernières suppressions</p>
          <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
            {journal.map((j) => (
              <p key={j.id} className="px-3 py-2 text-xs text-stone-600 flex justify-between gap-2">
                <span className="truncate"><strong className="text-stone-800">{j.nom}</strong> · {j.nb_ventes ?? 0} ventes · {j.nb_utilisateurs ?? 0} membres</span>
                <span className="shrink-0 text-stone-400">{date(j.supprime_le)}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {cible && (
        <ModaleSuppression
          entreprise={cible}
          onFerme={() => setCible(null)}
          onSupprime={(texte) => { setCible(null); setMessage(texte); charger(); }}
        />
      )}
    </div>
  );
}

function ModaleSuppression({ entreprise, onFerme, onSupprime }: { entreprise: EntrepriseInactive; onFerme: () => void; onSupprime: (message: string) => void }) {
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const concorde = saisie.trim() === entreprise.nom.trim();

  async function supprimer() {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await supprimerEntrepriseInactive(entreprise.id, saisie);
      onSupprime(`« ${r.nom} » a été supprimée (${r.comptesEfface} compte${r.comptesEfface > 1 ? "s" : ""} de connexion effacé${r.comptesEfface > 1 ? "s" : ""}).`);
    } catch (e: any) {
      setErreur(e.message || "Suppression impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy/50 p-0 sm:p-4" onClick={onFerme}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-display text-xl font-bold text-stone-900">Supprimer définitivement</p>
          <button onClick={onFerme} className="text-stone-400 hover:text-stone-700"><X size={20} /></button>
        </div>
        <div className="flex gap-2 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>
            Toutes les données de <strong>{entreprise.nom}</strong> seront effacées : {entreprise.nb_ventes} ventes, stock,
            clients, factures, et {entreprise.nb_utilisateurs} compte{entreprise.nb_utilisateurs > 1 ? "s" : ""} de connexion. Cette action est irréversible.
          </p>
        </div>
        <label className="block mt-4">
          <span className="text-xs font-medium text-stone-500">Pour confirmer, tape le nom de l'entreprise : <strong className="text-stone-800">{entreprise.nom}</strong></span>
          <input value={saisie} onChange={(e) => setSaisie(e.target.value)} autoFocus className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm" />
        </label>
        {erreur && <p className="text-sm text-red-600 mt-2">{erreur}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onFerme} className="flex-1 border border-stone-300 text-stone-700 font-medium py-2.5 rounded-xl text-sm">Annuler</button>
          <button onClick={supprimer} disabled={!concorde || enCours}
            className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {enCours && <Loader2 size={15} className="animate-spin" />} Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
