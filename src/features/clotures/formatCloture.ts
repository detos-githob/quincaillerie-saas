import type { TypeCloture } from "../../types";

export function formatF(montant: number | null | undefined): string {
  return Math.round(Number(montant) || 0).toLocaleString("fr-FR") + " F";
}

/** Montant signé, pour les écarts : « +1 500 F », « −500 F », « 0 F ». */
export function formatEcart(montant: number | null | undefined): string {
  const n = Math.round(Number(montant) || 0);
  if (n === 0) return "0 F";
  return (n > 0 ? "+" : "−") + Math.abs(n).toLocaleString("fr-FR") + " F";
}

/** "2026-09-28" → Date locale sans décalage de fuseau. */
export function dateDepuisIso(iso: string): Date {
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, j);
}

export function isoDepuisDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}

export function libellePeriode(type: TypeCloture, debutIso: string, court = false): string {
  const d = dateDepuisIso(debutIso);
  if (type === "jour") {
    return d.toLocaleDateString("fr-FR", {
      weekday: court ? undefined : "long",
      day: "numeric",
      month: court ? "short" : "long",
      year: "numeric",
    });
  }
  if (type === "mois") {
    const texte = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  }
  return String(d.getFullYear());
}

export const TITRE_TYPE: Record<TypeCloture, string> = {
  jour: "Journée",
  mois: "Mois",
  annee: "Année",
};
