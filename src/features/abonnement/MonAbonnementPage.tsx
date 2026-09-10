import { Navigate, useNavigate } from "react-router-dom";
import { CreditCard, CircleCheck, AlertTriangle } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { calculerStatutAbonnement } from "../../lib/abonnement";

const LABEL_STATUT: Record<string, { texte: string; classe: string; icone: typeof CircleCheck }> = {
  illimite: { texte: "Accès illimité", classe: "text-slate-600 bg-slate-50 border-slate-200", icone: CircleCheck },
  actif: { texte: "Abonnement actif", classe: "text-emerald-700 bg-emerald-50 border-emerald-200", icone: CircleCheck },
  alerte: { texte: "Bientôt expiré", classe: "text-amber-800 bg-amber-50 border-amber-200", icone: AlertTriangle },
  expire: { texte: "Abonnement expiré", classe: "text-red-700 bg-red-50 border-red-200", icone: AlertTriangle },
};

export function MonAbonnementPage() {
  const { utilisateur, entreprise } = useAuth();
  const navigate = useNavigate();

  if (utilisateur && utilisateur.role !== "gerant") {
    return <Navigate to="/" replace />;
  }

  if (!entreprise) {
    return <div className="p-6 text-stone-400 text-sm">Chargement...</div>;
  }

  const { statut, joursRestants } = calculerStatutAbonnement(entreprise);
  const info = LABEL_STATUT[statut];
  const Icone = info.icone;

  return (
    <div className="max-w-xl mx-auto px-4 py-5">
      <h1 className="font-display text-2xl font-bold text-stone-900 mb-4">Mon abonnement</h1>

      <div className={`rounded-2xl border-2 p-5 flex items-start gap-4 ${info.classe}`}>
        <Icone size={24} className="shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-display text-xl font-bold">{info.texte}</p>
          <p className="text-sm mt-1 opacity-90">
            Palier : <strong className="capitalize">{entreprise.plan_abonnement}</strong>
            {entreprise.periodicite_abonnement && ` · ${entreprise.periodicite_abonnement}`}
          </p>
          {entreprise.date_expiration_abonnement && (
            <p className="text-sm mt-0.5 opacity-90">
              {statut === "expire"
                ? `Expiré depuis ${Math.abs(joursRestants!)} jour(s) — le ${entreprise.date_expiration_abonnement}`
                : `Expire le ${entreprise.date_expiration_abonnement} (dans ${joursRestants} jour${joursRestants! > 1 ? "s" : ""})`}
            </p>
          )}
        </div>
      </div>

      <button
        onClick={() => navigate("/offres")}
        className="w-full mt-5 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3.5 rounded-xl transition-colors"
      >
        <CreditCard size={18} />
        Réabonnement
      </button>

      <p className="text-xs text-stone-400 text-center mt-3">
        Paiement sécurisé par Mobile Money (MTN, Moov) via Kkiapay.
      </p>
    </div>
  );
}
