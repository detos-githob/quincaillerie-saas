import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

export function AbonnementExpirePage() {
  const { session, entreprise, utilisateur, chargement, deconnexion } = useAuth();
  const navigate = useNavigate();
  const [sortie, setSortie] = useState(false);

  // Page publique : sans session (déconnecté), on retourne à la connexion.
  if (!chargement && !session) {
    return <Navigate to="/login" replace />;
  }

  async function seDeconnecter() {
    setSortie(true);
    try {
      await deconnexion();
    } finally {
      navigate("/login", { replace: true });
    }
  }

  const estGerant = utilisateur?.role === "gerant";
  // Compte créé aujourd'hui mais déjà expiré : le numéro de téléphone avait
  // déjà servi à un essai gratuit (une seule période d'essai par numéro).
  const sansEssai =
    !!entreprise?.created_at &&
    !!entreprise.date_expiration_abonnement &&
    new Date(entreprise.date_expiration_abonnement) < new Date(entreprise.created_at.slice(0, 10));

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
          {sansEssai ? "Abonnement à activer" : entreprise && !entreprise.actif ? "Compte suspendu" : "Abonnement expiré"}
        </h1>
        <p className="text-sm text-stone-600">
          {sansEssai ? (
            <>
              Ce numéro de téléphone a déjà bénéficié d'un essai gratuit. Pour utiliser{" "}
              <strong>{entreprise?.nom}</strong>, choisis une offre.
            </>
          ) : (
            <>
              L'abonnement {entreprise?.nom ? <>de <strong>{entreprise.nom}</strong> </> : ""}est arrivé à expiration.{" "}
              {estGerant
                ? "Renouvelle-le pour retrouver l'accès à ton espace. Tes données sont conservées."
                : "Demande au gérant de le renouveler pour retrouver l'accès."}
            </>
          )}
        </p>
        {estGerant && (
          <button
            onClick={() => navigate("/offres")}
            className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold py-3 rounded-xl transition-colors"
          >
            {sansEssai ? "Choisir une offre" : "Renouveler maintenant"}
          </button>
        )}
        <button
          onClick={seDeconnecter}
          disabled={sortie}
          className="inline-flex items-center justify-center gap-2 text-sm font-medium text-amber-600 mt-2 disabled:opacity-60"
        >
          {sortie && <Loader2 size={14} className="animate-spin" />} Se déconnecter
        </button>
      </div>
    </div>
  );
}
