import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { calculerStatutAbonnement } from "../lib/abonnement";
import type { ReactNode } from "react";

// Pages accessibles même si l'abonnement est expiré, pour permettre au
// gérant de le renouveler sans rester bloqué.
const CHEMINS_EXEMPTES_EXPIRATION = ["/mon-abonnement", "/offres", "/paiement"];

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, utilisateur, entreprise, chargement } = useAuth();
  const location = useLocation();

  if (chargement) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-400 text-sm">
        Chargement...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!utilisateur) {
    return <Navigate to="/completer-inscription" replace />;
  }

  const exempte = CHEMINS_EXEMPTES_EXPIRATION.some((c) => location.pathname.startsWith(c));

  if (entreprise && !exempte) {
    const { statut } = calculerStatutAbonnement(entreprise);
    if (!entreprise.actif || statut === "expire") {
      return <Navigate to="/abonnement-expire" replace />;
    }
  }

  return <>{children}</>;
}
