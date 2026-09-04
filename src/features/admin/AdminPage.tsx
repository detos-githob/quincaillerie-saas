import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Building2, X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { listerEntreprisesAdmin, modifierAbonnement } from "../../services/adminService";
import { calculerStatutAbonnement } from "../../lib/abonnement";
import type { Entreprise } from "../../types";

const STYLES_STATUT: Record<string, { bg: string; texte: string; label: string }> = {
  illimite: { bg: "bg-slate-100", texte: "text-slate-600", label: "Illimité" },
  actif: { bg: "bg-emerald-100", texte: "text-emerald-700", label: "Actif" },
  alerte: { bg: "bg-amber-100", texte: "text-amber-800", label: "Bientôt expiré" },
  expire: { bg: "bg-red-100", texte: "text-red-700", label: "Expiré" },
};

export function AdminPage() {
  const { estSuperAdmin, chargement: chargementAuth } = useAuth();
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);
  const [chargement, setChargement] = useState(true);
  const [entrepriseEnEdition, setEntrepriseEnEdition] = useState<Entreprise | null>(null);

  useEffect(() => {
    if (!estSuperAdmin) return;
    listerEntreprisesAdmin()
      .then(setEntreprises)
      .finally(() => setChargement(false));
  }, [estSuperAdmin]);

  if (!chargementAuth && !estSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  if (chargementAuth || chargement) {
    return <div className="p-6 text-stone-400 text-sm">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-stone-50 font-body">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Barlow Condensed', sans-serif; }
        .font-body { font-family: 'Inter', sans-serif; }
      `}</style>

      <header className="bg-stone-900 text-stone-50 px-5 py-4">
        <h1 className="font-display text-2xl font-bold">Administration — Abonnements</h1>
        <p className="text-stone-400 text-xs mt-0.5">
          {entreprises.length} entreprise{entreprises.length > 1 ? "s" : ""} inscrite
          {entreprises.length > 1 ? "s" : ""}
        </p>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {entreprises.map((entreprise) => {
            const { statut, joursRestants } = calculerStatutAbonnement(entreprise);
            const style = STYLES_STATUT[statut];
            return (
              <button
                key={entreprise.id}
                onClick={() => setEntrepriseEnEdition(entreprise)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-stone-100 shrink-0">
                    <Building2 size={16} className="text-stone-400" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{entreprise.nom}</p>
                    <p className="text-xs text-stone-400">
                      {entreprise.plan_abonnement} · {entreprise.periodicite_abonnement || "—"}
                      {joursRestants !== null &&
                        ` · ${joursRestants >= 0 ? `${joursRestants}j restants` : `expiré depuis ${-joursRestants}j`}`}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded shrink-0 ${style.bg} ${style.texte}`}>
                  {style.label}
                </span>
              </button>
            );
          })}
          {entreprises.length === 0 && (
            <p className="p-6 text-center text-stone-400 text-sm">Aucune entreprise inscrite.</p>
          )}
        </div>
      </main>

      {entrepriseEnEdition && (
        <ModaleAbonnement
          entreprise={entrepriseEnEdition}
          onFerme={() => setEntrepriseEnEdition(null)}
          onEnregistre={(champs) =>
            setEntreprises((prev) =>
              prev.map((e) => (e.id === entrepriseEnEdition.id ? { ...e, ...champs } : e))
            )
          }
        />
      )}
    </div>
  );
}

function ModaleAbonnement({
  entreprise,
  onFerme,
  onEnregistre,
}: {
  entreprise: Entreprise;
  onFerme: () => void;
  onEnregistre: (champs: Partial<Entreprise>) => void;
}) {
  const [plan, setPlan] = useState(entreprise.plan_abonnement);
  const [periodicite, setPeriodicite] = useState<"mensuel" | "annuel">(
    entreprise.periodicite_abonnement || "mensuel"
  );
  const [dateExpiration, setDateExpiration] = useState(entreprise.date_expiration_abonnement || "");
  const [actif, setActif] = useState(entreprise.actif);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function gererEnregistrement() {
    setEnCours(true);
    setErreur(null);
    try {
      await modifierAbonnement(entreprise.id, plan, periodicite, dateExpiration || null, actif);
      onEnregistre({
        plan_abonnement: plan,
        periodicite_abonnement: periodicite,
        date_expiration_abonnement: dateExpiration || null,
        actif,
      });
      onFerme();
    } catch (e: any) {
      setErreur(e.message || "Erreur lors de l'enregistrement.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onFerme} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-stone-900">{entreprise.nom}</h2>
          <button onClick={onFerme} className="text-stone-400">
            <X size={20} />
          </button>
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">Palier</label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm bg-white"
          >
            <option value="essai">Essai</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">Périodicité</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {(["mensuel", "annuel"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodicite(p)}
                className={`py-2 rounded-lg text-sm font-medium border capitalize ${
                  periodicite === p
                    ? "bg-slate-700 text-white border-slate-700"
                    : "bg-white text-stone-600 border-stone-300"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-stone-500">Date d'expiration</label>
          <input
            type="date"
            value={dateExpiration}
            onChange={(e) => setDateExpiration(e.target.value)}
            className="w-full mt-1 border border-stone-300 rounded-lg py-2 px-3 text-sm"
          />
          <p className="text-[11px] text-stone-400 mt-1">
            Laisse vide pour un accès illimité (pas d'alerte d'expiration).
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
          Compte actif (décoche pour suspendre immédiatement l'accès)
        </label>

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <button
          onClick={gererEnregistrement}
          disabled={enCours}
          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
        >
          {enCours ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
