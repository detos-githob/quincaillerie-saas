import { supabase } from "../lib/supabaseClient";

export interface Offre {
  id: "starter" | "business";
  nom: string;
  description: string;
  prixMensuel: number;
  prixAnnuel: number;
}

export const OFFRES: Offre[] = [
  {
    id: "starter",
    nom: "Starter",
    description: "Idéal pour un petit commerce",
    prixMensuel: 3000,
    prixAnnuel: 35000,
  },
  {
    id: "business",
    nom: "Business",
    description: "Le plus populaire — grossistes et semi-grossistes",
    prixMensuel: 5000,
    prixAnnuel: 55000,
  },
];

export function trouverOffre(id: string): Offre | undefined {
  return OFFRES.find((o) => o.id === id);
}

export function calculerMontant(offre: Offre, periodicite: "mensuel" | "annuel"): number {
  return periodicite === "annuel" ? offre.prixAnnuel : offre.prixMensuel;
}

/**
 * Demande à la fonction serveur de vérifier une transaction Kkiapay
 * (jamais faire confiance au seul succès affiché côté navigateur) et,
 * si elle est valide, prolonge l'abonnement de l'entreprise.
 */
export async function confirmerPaiement(
  transactionId: string,
  entrepriseId: string,
  plan: "starter" | "business",
  periodicite: "mensuel" | "annuel"
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Session expirée, reconnecte-toi.");

  const reponse = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verifier-paiement-abonnement`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ transactionId, entrepriseId, plan, periodicite }),
    }
  );

  const resultat = await reponse.json();
  if (!reponse.ok) {
    throw new Error(resultat.error || "Le paiement n'a pas pu être confirmé.");
  }
}
