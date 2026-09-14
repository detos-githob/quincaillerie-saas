import type { SecteurActivite } from "../types";

export const LABELS_SECTEUR_ACTIVITE: Record<SecteurActivite, string> = {
  quincaillerie: "Quincaillerie",
  depot_boissons: "Dépôt de boissons",
  alimentation_generale: "Alimentation générale",
  pieces_detachees: "Vente de pièces détachées",
  autre: "Autre",
};

export const OPTIONS_SECTEUR_ACTIVITE: SecteurActivite[] = [
  "quincaillerie",
  "depot_boissons",
  "alimentation_generale",
  "pieces_detachees",
  "autre",
];

/**
 * Nom d'affichage du secteur, en tenant compte du libellé libre saisi
 * quand secteur_activite = "autre".
 */
export function libelleSecteurActivite(
  secteur: SecteurActivite,
  secteurAutre: string | null
): string {
  if (secteur === "autre" && secteurAutre) return secteurAutre;
  return LABELS_SECTEUR_ACTIVITE[secteur];
}
