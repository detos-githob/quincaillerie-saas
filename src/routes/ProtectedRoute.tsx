import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { calculerStatutAbonnement } from "../lib/abonnement";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, utilisateur, entreprise, chargement } = useAuth();

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
    // Compte authentifié mais pas encore lié à une entreprise
    // (inscription interrompue avant la dernière étape).
    return <Navigate to="/completer-inscription" replace />;
  }

  if (entreprise) {
    const { statut } = calculerStatutAbonnement(entreprise);
    if (!entreprise.actif || statut === "expire") {
      return <Navigate to="/abonnement-expire" replace />;
    }
  }

  return <>{children}</>;
}
