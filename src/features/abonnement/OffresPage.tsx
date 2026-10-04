import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Check } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import {
  economieAnnuelle,
  listerOffresPubliques,
  prixOffre,
  type OffreAbonnement,
} from "../../services/offresService";

function formatFCFA(montant: number): string {
  return montant.toLocaleString("fr-FR") + " FCFA";
}

export function OffresPage() {
  const { utilisateur, entreprise } = useAuth();
  const navigate = useNavigate();
  const [periodicite, setPeriodicite] = useState<"mensuel" | "annuel">("mensuel");
  const [offres, setOffres] = useState<OffreAbonnement[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerOffresPubliques()
      .then((r) => setOffres(r.offres))
      .catch(() => setErreur("Impossible de charger les offres. Vérifie ta connexion."));
  }, []);

  if (utilisateur && utilisateur.role !== "gerant") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h1 className="font-display text-3xl font-bold text-stone-900">Choisis ton offre</h1>
        <p className="text-stone-500 text-sm mt-1">
          Paiement Mobile Money, sans engagement. Un code promo ? Tu pourras le saisir à l'étape suivante.
        </p>
      </div>

      <div className="flex justify-center mb-6">
        <div className="inline-flex bg-stone-100 rounded-full p-1">
          {(["mensuel", "annuel"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodicite(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                periodicite === p ? "bg-navy text-white" : "text-stone-600"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {erreur && <p className="text-sm text-red-600 text-center">{erreur}</p>}
      {!offres && !erreur && <p className="text-sm text-stone-400 text-center">Chargement des offres...</p>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {offres?.map((offre) => {
          const prix = prixOffre(offre, periodicite);
          const actuelle = entreprise?.plan_abonnement === offre.id;
          const economie = economieAnnuelle(offre);
          return (
            <div
              key={offre.id}
              className={`rounded-2xl border-2 p-5 flex flex-col ${
                offre.recommandee ? "border-amber-400 bg-amber-50" : "border-stone-200 bg-white"
              }`}
            >
              <div className="flex gap-1.5 mb-2 min-h-[22px]">
                {offre.recommandee && (
                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    Recommandée
                  </span>
                )}
                {actuelle && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Ton offre actuelle
                  </span>
                )}
              </div>
              <p className="font-display text-2xl font-bold text-stone-900">{offre.nom}</p>
              <p className="text-sm text-stone-500 mt-1">{offre.description}</p>
              <p className="font-display text-3xl font-bold text-stone-900 mt-4 tabular-nums">
                {formatFCFA(prix)}
                <span className="text-sm font-normal text-stone-400">/{periodicite === "annuel" ? "an" : "mois"}</span>
              </p>
              <p className="text-xs text-emerald-700 h-4 mt-0.5">
                {periodicite === "annuel" && economie > 0 ? `${formatFCFA(economie)} d'économie par an` : ""}
              </p>

              <ul className="mt-4 space-y-1.5 flex-1">
                {offre.avantages.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-stone-600">
                    <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => navigate(`/paiement?plan=${encodeURIComponent(offre.id)}&periode=${periodicite}`)}
                className={`w-full mt-5 py-2.5 rounded-xl font-semibold transition-colors ${
                  offre.recommandee
                    ? "bg-amber-500 hover:bg-amber-600 text-stone-900"
                    : "bg-navy hover:bg-navy-800 text-white"
                }`}
              >
                {actuelle ? "Renouveler" : "Souscrire"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
