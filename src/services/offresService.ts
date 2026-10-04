import { supabase } from "../lib/supabaseClient";

/** Modules qu'une offre peut inclure ou non (le reste est inclus partout). */
export type ModuleOffre = "fournisseurs" | "depot_boissons" | "depenses" | "tableau_decisionnel";

export const MODULES_OFFRE: { id: ModuleOffre; label: string; detail: string }[] = [
  { id: "fournisseurs", label: "Fournisseurs et commandes", detail: "Fiches fournisseurs, commandes, réceptions" },
  { id: "depot_boissons", label: "Dépôt de boissons", detail: "Casiers, consignes, casses" },
  { id: "depenses", label: "Personnel et dépenses", detail: "Salaires, dépenses du magasin" },
  { id: "tableau_decisionnel", label: "Tableau de bord décisionnel", detail: "Marge, stock dormant, argent immobilisé" },
];

export interface OffreAbonnement {
  id: string;
  nom: string;
  description: string;
  prix_mensuel: number;
  prix_annuel: number;
  max_utilisateurs: number;
  modules: ModuleOffre[];
  avantages: string[];
  est_essai: boolean;
  duree_essai_jours: number | null;
  publique: boolean;
  recommandee: boolean;
  active: boolean;
  ordre: number;
}

function normaliser(o: OffreAbonnement): OffreAbonnement {
  return { ...o, prix_mensuel: Number(o.prix_mensuel), prix_annuel: Number(o.prix_annuel) };
}

/** Toutes les offres (super admin), triées. */
export async function listerToutesLesOffres(): Promise<OffreAbonnement[]> {
  const { data, error } = await supabase.from("offres").select("*").order("ordre").order("nom");
  if (error) throw error;
  return (data as OffreAbonnement[]).map(normaliser);
}

/** Offres proposées à la vente (page Offres, page d'accueil) + l'essai. */
export async function listerOffresPubliques(): Promise<{ essai: OffreAbonnement | null; offres: OffreAbonnement[] }> {
  const toutes = await listerToutesLesOffres();
  return {
    essai: toutes.find((o) => o.est_essai) ?? null,
    offres: toutes.filter((o) => o.publique && o.active && !o.est_essai),
  };
}

export async function obtenirOffre(id: string): Promise<OffreAbonnement | null> {
  const { data, error } = await supabase.from("offres").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normaliser(data as OffreAbonnement) : null;
}

export async function enregistrerOffre(offre: Partial<OffreAbonnement> & { id: string }): Promise<string> {
  const { data, error } = await supabase.rpc("admin_enregistrer_offre", { p: offre });
  if (error) throw error;
  return data as string;
}

export function prixOffre(offre: OffreAbonnement, periodicite: "mensuel" | "annuel"): number {
  return periodicite === "annuel" ? offre.prix_annuel : offre.prix_mensuel;
}

/** Économie annuelle par rapport à 12 mois au tarif mensuel. */
export function economieAnnuelle(offre: OffreAbonnement): number {
  return Math.max(0, offre.prix_mensuel * 12 - offre.prix_annuel);
}
