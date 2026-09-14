import type { Article, TypeClient } from "../types";

/**
 * Détermine le prix unitaire à appliquer pour un article, en fonction
 * du type du client (détail / demi-gros / gros) et de la quantité
 * achetée. Le palier le plus avantageux pour le client entre "type de
 * client" et "quantité" est retenu (un client classé "gros" profite du
 * tarif gros dès la 1ère unité, un client "détail" qui achète une
 * grosse quantité profite aussi du tarif si un seuil est configuré).
 *
 * Retombe sur le prix détail (prix_vente) si aucun palier gros/demi-gros
 * n'est configuré sur l'article, ou si le client/la quantité n'atteint
 * aucun seuil — c'est donc totalement transparent pour les articles/
 * clients qui n'utilisent pas la vente en gros.
 */
export function prixUnitaireApplicable(
  article: Article,
  quantite: number,
  typeClient: TypeClient
): number {
  const eligibleGros =
    article.prix_gros != null &&
    (typeClient === "gros" || (article.seuil_gros != null && quantite >= article.seuil_gros));

  if (eligibleGros) return article.prix_gros as number;

  const eligibleDemiGros =
    article.prix_demi_gros != null &&
    (typeClient === "gros" ||
      typeClient === "demi_gros" ||
      (article.seuil_demi_gros != null && quantite >= article.seuil_demi_gros));

  if (eligibleDemiGros) return article.prix_demi_gros as number;

  return article.prix_vente;
}

export const LABELS_TYPE_CLIENT: Record<TypeClient, string> = {
  detail: "Détail",
  demi_gros: "Demi-gros",
  gros: "Gros",
};
