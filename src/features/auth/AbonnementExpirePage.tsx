import { AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

export function AbonnementExpirePage() {
  const { entreprise, utilisateur, deconnexion } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 font-body">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Barlow Condensed', sans-serif; }
        .font-body { font-family: 'Inter', sans-serif; }
      `}</style>
      <div className="w-full max-w-sm bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-3">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto">
          <AlertTriangle size={22} className="text-red-500" />
        </span>
        <h1 className="font-display text-2xl font-bold text-stone-900">
          Abonnement expiré
        </h1>
        <p className="text-sm text-stone-600">
          L'abonnement de <strong>{entreprise?.nom}</strong> est arrivé à expiration. Contacte
          l'éditeur du logiciel pour le renouveler et retrouver l'accès à ton espace.
        </p>
        {utilisateur?.role === "gerant" && (
          <button
            onClick={() => navigate("/offres")}
            className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl transition-colors"
          >
            Renouveler maintenant
          </button>
        )}
        <button
          onClick={deconnexion}
          className="text-sm font-medium text-amber-600 mt-2"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
