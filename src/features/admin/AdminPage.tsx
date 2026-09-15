import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Building2, X, Bell } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { listerEntreprisesAdmin, modifierAbonnement } from "../../services/adminService";
import { calculerStatutAbonnement, STYLES_STATUT_ABONNEMENT as STYLES_STATUT } from "../../lib/abonnement";
import { libelleSecteurActivite, LABELS_SECTEUR_ACTIVITE, OPTIONS_SECTEUR_ACTIVITE } from "../../lib/secteurActivite";
import type { Entreprise, SecteurActivite } from "../../types";

const MS_48H = 48 * 60 * 60 * 1000;
const MS_7J = 7 * 24 * 60 * 60 * 1000;

function estRecente(entreprise: Entreprise): boolean {
  if (!entreprise.created_at) return false;
  return Date.now() - new Date(entreprise.created_at).getTime() < MS_48H;
}

export function AdminPage() {
  const { estSuperAdmin, chargement: chargementAuth } = useAuth();
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);
  const [chargement, setChargement] = useState(true);
  const [entrepriseEnEdition, setEntrepriseEnEdition] = useState<Entreprise | null>(null);
  const [secteurFiltre, setSecteurFiltre] = useState<SecteurActivite | "tous">("tous");

  useEffect(() => {
    if (!estSuperAdmin) return;
    listerEntreprisesAdmin()
      .then(setEntreprises)
      .finally(() => setChargement(false));
  }, [estSuperAdmin]);

  const entreprisesFiltrees = useMemo(
    () =>
      secteurFiltre === "tous"
        ? entreprises
        : entreprises.filter((e) => e.secteur_activite === secteurFiltre),
    [entreprises, secteurFiltre]
  );

  // Regroupées par secteur (dans l'ordre du sélecteur d'inscription),
  // chaque groupe trié par date d'inscription la plus récente d'abord.
  const groupesParSecteur = useMemo(() => {
    return OPTIONS_SECTEUR_ACTIVITE.map((secteur) => ({
      secteur,
      entreprises: entreprisesFiltrees
        .filter((e) => e.secteur_activite === secteur)
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")),
    })).filter((g) => g.entreprises.length > 0);
  }, [entreprisesFiltrees]);

  const [clocheOuverte, setClocheOuverte] = useState(false);

  const inscriptionsRecentes = useMemo(
    () =>
      entreprises
        .filter((e) => e.created_at && Date.now() - new Date(e.created_at).getTime() < MS_7J)
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")),
    [entreprises]
  );

  const abonnementsARenouveler = useMemo(
    () =>
      entreprises
        .map((e) => ({ entreprise: e, info: calculerStatutAbonnement(e) }))
        .filter((x) => x.info.statut === "alerte" || x.info.statut === "expire")
        .sort((a, b) => (a.info.joursRestants ?? 0) - (b.info.joursRestants ?? 0)),
    [entreprises]
  );

  const nombreNotifications = inscriptionsRecentes.length + abonnementsARenouveler.length;

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

      <header className="bg-stone-900 text-stone-50 px-5 py-4 relative">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Administration — Abonnements</h1>
            <p className="text-stone-400 text-xs mt-0.5">
              {entreprises.length} entreprise{entreprises.length > 1 ? "s" : ""} inscrite
              {entreprises.length > 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => setClocheOuverte((v) => !v)}
            className="relative flex items-center justify-center w-10 h-10 rounded-full bg-stone-800 shrink-0"
          >
            <Bell size={18} />
            {nombreNotifications > 0 && (
              <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-stone-900 text-[10px] font-bold">
                {nombreNotifications}
              </span>
            )}
          </button>
        </div>

        {clocheOuverte && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setClocheOuverte(false)} />
            <div className="absolute right-5 top-16 z-40 w-80 max-h-[70vh] overflow-y-auto bg-white text-stone-900 rounded-xl shadow-xl border border-stone-200">
              <div className="p-3 border-b border-stone-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                  Nouvelles inscriptions (7 derniers jours)
                </p>
              </div>
              {inscriptionsRecentes.length === 0 && (
                <p className="p-3 text-xs text-stone-400">Aucune inscription récente.</p>
              )}
              {inscriptionsRecentes.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    setEntrepriseEnEdition(e);
                    setClocheOuverte(false);
                  }}
                  className="w-full text-left px-3 py-2.5 border-b border-stone-50 hover:bg-stone-50"
                >
                  <p className="text-sm font-medium truncate">{e.nom}</p>
                  <p className="text-xs text-stone-400">
                    {libelleSecteurActivite(e.secteur_activite, e.secteur_activite_autre)}
                    {e.created_at && ` · ${new Date(e.created_at).toLocaleDateString("fr-FR")}`}
                  </p>
                </button>
              ))}

              <div className="p-3 border-b border-t border-stone-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                  Abonnements à renouveler
                </p>
              </div>
              {abonnementsARenouveler.length === 0 && (
                <p className="p-3 text-xs text-stone-400">Aucun abonnement en alerte.</p>
              )}
              {abonnementsARenouveler.map(({ entreprise: e, info }) => (
                <button
                  key={e.id}
                  onClick={() => {
                    setEntrepriseEnEdition(e);
                    setClocheOuverte(false);
                  }}
                  className="w-full text-left px-3 py-2.5 border-b border-stone-50 hover:bg-stone-50 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{e.nom}</p>
                    <p className="text-xs text-stone-400">{e.plan_abonnement}</p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded shrink-0 ${STYLES_STATUT[info.statut].bg} ${STYLES_STATUT[info.statut].texte}`}
                  >
                    {info.joursRestants !== null && info.joursRestants >= 0
                      ? `${info.joursRestants}j`
                      : `expiré ${Math.abs(info.joursRestants ?? 0)}j`}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        {/* Filtre par secteur d'activité */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setSecteurFiltre("tous")}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${
              secteurFiltre === "tous"
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-600 border-stone-300"
            }`}
          >
            Tous
          </button>
          {OPTIONS_SECTEUR_ACTIVITE.map((s) => {
            const nb = entreprises.filter((e) => e.secteur_activite === s).length;
            if (nb === 0) return null;
            return (
              <button
                key={s}
                onClick={() => setSecteurFiltre(s)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${
                  secteurFiltre === s
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-white text-stone-600 border-stone-300"
                }`}
              >
                {LABELS_SECTEUR_ACTIVITE[s]} ({nb})
              </button>
            );
          })}
        </div>

        {/* Liste groupée par secteur */}
        <div className="space-y-5">
          {groupesParSecteur.map((groupe) => (
            <div key={groupe.secteur}>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2 px-1">
                {LABELS_SECTEUR_ACTIVITE[groupe.secteur]} ({groupe.entreprises.length})
              </p>
              <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
                {groupe.entreprises.map((entreprise) => {
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
                          <p className="text-sm font-medium text-stone-900 truncate flex items-center gap-1.5">
                            {entreprise.nom}
                            {estRecente(entreprise) && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
                                Nouveau
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-stone-400">
                            {entreprise.secteur_activite === "autre" &&
                              `${libelleSecteurActivite(entreprise.secteur_activite, entreprise.secteur_activite_autre)} · `}
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
              </div>
            </div>
          ))}
          {groupesParSecteur.length === 0 && (
            <div className="bg-white border border-stone-200 rounded-xl p-6 text-center text-stone-400 text-sm">
              Aucune entreprise {secteurFiltre !== "tous" ? "dans ce secteur" : "inscrite"}.
            </div>
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
