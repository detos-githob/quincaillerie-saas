// Source de vérité des prix côté serveur. Le navigateur n'envoie jamais
// de montant : il envoie l'offre choisie, le serveur en déduit le prix.
// À garder synchronisé avec src/services/abonnementService.ts (affichage).
export const TARIFS: Record<string, { mensuel: number; annuel: number; nom: string }> = {
  starter: { nom: "Starter", mensuel: 3000, annuel: 35000 },
  business: { nom: "Business", mensuel: 5000, annuel: 55000 },
};

export type Periodicite = "mensuel" | "annuel";

export function prixOffre(plan: unknown, periodicite: unknown): number | null {
  if (typeof plan !== "string" || !TARIFS[plan]) return null;
  if (periodicite !== "mensuel" && periodicite !== "annuel") return null;
  return TARIFS[plan][periodicite];
}
