import type { Entreprise, SecteurActivite } from "../types";
import type { OffreAbonnement } from "../services/offresService";

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

/** Nombre d'activités permises par l'offre (offre inconnue : pas de limite). */
export function maxSecteurs(offre: OffreAbonnement | null): number {
  return offre?.max_secteurs ?? 5;
}

/**
 * Activités réellement ouvertes : l'activité principale d'abord, puis les
 * autres, dans la limite de l'offre. Si le commerce est passé à une offre
 * inférieure en gardant plus d'activités, les dernières sont mises en
 * pause (leurs données restent intactes) jusqu'à ce qu'il choisisse.
 */
export function secteursEffectifs(entreprise: Entreprise | null, offre: OffreAbonnement | null): SecteurActivite[] {
  if (!entreprise) return [];
  const actifs = entreprise.secteurs_actifs?.length ? entreprise.secteurs_actifs : [entreprise.secteur_activite];
  const ordonnes = [entreprise.secteur_activite, ...actifs.filter((s) => s !== entreprise.secteur_activite)];
  return ordonnes.slice(0, maxSecteurs(offre));
}
