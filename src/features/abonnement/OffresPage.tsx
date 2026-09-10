import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Check } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { OFFRES } from "../../services/abonnementService";

function formatFCFA(montant: number): string {
  return montant.toLocaleString("fr-FR") + " FCFA";
}

export function OffresPage() {
  const { utilisateur } = useAuth();
  const navigate = useNavigate();
  const [periodicite, setPeriodicite] = useState<"mensuel" | "annuel">("mensuel");

  if (utilisateur && utilisateur.role !== "gerant") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h1 className="font-display text-3xl font-bold text-stone-900">Choisis ton offre</h1>
        <p className="text-stone-500 text-sm mt-1">Paiement Mobile Money, sans engagement</p>
      </div>

      <div className="flex justify-center mb-6">
        <div className="inline-flex bg-stone-100 rounded-full p-1">
          {(["mensuel", "annuel"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodicite(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                periodicite === p ? "bg-stone-900 text-white" : "text-stone-600"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {OFFRES.map((offre) => {
          const prix = periodicite === "annuel" ? offre.prixAnnuel : offre.prixMensuel;
          const populaire = offre.id === "business";
          return (
            <div
              key={offre.id}
              className={`rounded-2xl border-2 p-5 flex flex-col ${
                populaire ? "border-amber-400 bg-amber-50" : "border-stone-200 bg-white"
              }`}
            >
              {populaire && (
                <span className="self-start text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full mb-2">
                  Le plus populaire
                </span>
              )}
              <p className="font-display text-2xl font-bold text-stone-900">{offre.nom}</p>
              <p className="text-sm text-stone-500 mt-1">{offre.description}</p>
              <p className="font-display text-3xl font-bold text-stone-900 mt-4">
                {formatFCFA(prix)}
                <span className="text-sm font-normal text-stone-400">
                  /{periodicite === "annuel" ? "an" : "mois"}
                </span>
              </p>

              <ul className="mt-4 space-y-1.5 flex-1">
                {["Ventes et facturation illimitées", "Gestion du stock", "Rapports quotidiens", "Support"].map(
                  (f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-stone-600">
                      <Check size={14} className="text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  )
                )}
              </ul>

              <button
                onClick={() => navigate(`/paiement?plan=${offre.id}&periode=${periodicite}`)}
                className={`w-full mt-5 py-2.5 rounded-xl font-semibold transition-colors ${
                  populaire
                    ? "bg-amber-500 hover:bg-amber-600 text-stone-900"
                    : "bg-stone-900 hover:bg-stone-800 text-white"
                }`}
              >
                Souscrire
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
