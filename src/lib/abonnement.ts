import type { Entreprise } from "../types";

export type StatutAbonnement = "illimite" | "actif" | "alerte" | "expire";

export interface InfoAbonnement {
  statut: StatutAbonnement;
  joursRestants: number | null;
}

/**
 * Détermine le statut d'abonnement d'une entreprise et le nombre de
 * jours restants avant expiration.
 *
 * Seuil d'alerte : 7 jours avant expiration pour un abonnement mensuel,
 * 30 jours pour un abonnement annuel — comme demandé.
 */
export function calculerStatutAbonnement(entreprise: Entreprise): InfoAbonnement {
  if (!entreprise.date_expiration_abonnement) {
    return { statut: "illimite", joursRestants: null };
  }

  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const expiration = new Date(entreprise.date_expiration_abonnement);
  expiration.setHours(0, 0, 0, 0);

  const joursRestants = Math.round(
    (expiration.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (joursRestants < 0) {
    return { statut: "expire", joursRestants };
  }

  const seuilAlerte = entreprise.periodicite_abonnement === "annuel" ? 30 : 7;
  if (joursRestants <= seuilAlerte) {
    return { statut: "alerte", joursRestants };
  }

  return { statut: "actif", joursRestants };
}
