import type { Entreprise } from "../types";

export type StatutAbonnement = "illimite" | "actif" | "alerte" | "expire";

export interface InfoAbonnement {
  statut: StatutAbonnement;
  joursRestants: number | null;
}

export const STYLES_STATUT_ABONNEMENT: Record<
  StatutAbonnement,
  { bg: string; texte: string; label: string }
> = {
  illimite: { bg: "bg-slate-100", texte: "text-slate-600", label: "Illimité" },
  actif: { bg: "bg-emerald-100", texte: "text-emerald-700", label: "Actif" },
  alerte: { bg: "bg-amber-100", texte: "text-amber-800", label: "Bientôt expiré" },
  expire: { bg: "bg-red-100", texte: "text-red-700", label: "Expiré" },
};

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

// =====================================================================
// NIVEAU D'ACCÈS PAR PALIER D'ABONNEMENT
// =====================================================================

export type NiveauAcces = "basique" | "complet";

/**
 * "essai" et "starter" → accès basique (fonctionnalités restreintes).
 * Toute autre valeur (business, pro, illimité, ou un palier futur) →
 * accès complet par défaut : on ne restreint que ce qui est
 * explicitement nommé "basique", jamais par défaut, pour ne jamais
 * bloquer à tort un client payant sur un palier qu'on ne reconnaît pas.
 */
export function niveauAcces(planAbonnement: string): NiveauAcces {
  return planAbonnement === "essai" || planAbonnement === "starter" ? "basique" : "complet";
}

/** Nombre total de comptes utilisateurs autorisés, gérant compris. */
export function limiteEquipe(planAbonnement: string): number {
  return niveauAcces(planAbonnement) === "basique" ? 2 : 5;
}

/**
 * Chemins accessibles en accès "basique" (essai/starter) : tableau de
 * bord (rapport quotidien), vente journalière, stock, inventaire,
 * clients, factures, livraisons, tontine, équipe (plafonnée), support,
 * et la gestion de l'abonnement lui-même (pour
 * pouvoir passer sur un palier supérieur). Testé par préfixe pour
 * couvrir les sous-routes (ex : /tontines/:id).
 */
export const PREFIXES_ROUTES_ACCES_BASIQUE = [
  "/",
  "/vente",
  "/stock",
  "/inventaire",
  "/clients",
  "/factures",
  "/livraisons",
  "/tontines",
  "/clotures",
  "/equipe",
  "/mon-abonnement",
  "/support",
  "/offres",
  "/paiement",
];

export function routeAutoriseeEnAccesBasique(chemin: string): boolean {
  return PREFIXES_ROUTES_ACCES_BASIQUE.some((prefixe) =>
    prefixe === "/" ? chemin === "/" : chemin.startsWith(prefixe)
  );
}
