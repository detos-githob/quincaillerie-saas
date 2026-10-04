import { supabase } from "../lib/supabaseClient";

// Les offres et leurs prix sont en base (table « offres ») et se gèrent
// depuis l'espace super admin : voir services/offresService.ts.

/**
 * Demande à la fonction serveur de vérifier une transaction Kkiapay
 * (jamais faire confiance au seul succès affiché côté navigateur) et,
 * si elle est valide, prolonge l'abonnement de l'entreprise.
 */
export async function confirmerPaiement(
  transactionId: string,
  entrepriseId: string,
  plan: string,
  periodicite: "mensuel" | "annuel",
  code: string | null = null
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
      body: JSON.stringify({ transactionId, entrepriseId, plan, periodicite, code }),
    }
  );

  const resultat = await reponse.json();
  if (!reponse.ok) {
    throw new Error(resultat.error || "Le paiement n'a pas pu être confirmé.");
  }
}

// =====================================================================
// MTN MoMo (API directe) — tout passe par l'Edge Function
// momo-paiement-abonnement : le navigateur n'a jamais accès aux clés MTN
// et n'envoie jamais de montant (le serveur applique ses tarifs).
// =====================================================================

export type StatutPaiement = "en_attente" | "reussi" | "echoue" | "expire";

async function appelerFonctionMomo<T>(corps: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Session expirée, reconnecte-toi.");

  const reponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/momo-paiement-abonnement`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(corps),
  });
  const resultat = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(resultat.error || "Le service de paiement ne répond pas. Réessaie.");
  return resultat as T;
}

export function initierPaiementMomo(
  plan: string,
  periodicite: "mensuel" | "annuel",
  telephone: string,
  code: string | null = null
): Promise<{ paiementId: string; dejaEnCours?: boolean }> {
  return appelerFonctionMomo({ action: "initier", plan, periodicite, telephone, code });
}

export function statutPaiementMomo(
  paiementId: string
): Promise<{ statut: StatutPaiement; raison: string | null; dateExpiration: string | null }> {
  return appelerFonctionMomo({ action: "statut", paiementId });
}

/** Rattrape les paiements validés après la fermeture de la page de paiement. */
export function reconcilierPaiementsMomo(): Promise<{ reussis: number }> {
  return appelerFonctionMomo({ action: "reconcilier" });
}

export interface PaiementAbonnementLigne {
  id: string;
  fournisseur: "mtn_momo" | "kkiapay";
  plan: string;
  periodicite: string;
  montant: number;
  statut: StatutPaiement;
  raison_echec: string | null;
  date_expiration_apres: string | null;
  created_at: string;
}

export async function listerPaiementsAbonnement(limite = 10): Promise<PaiementAbonnementLigne[]> {
  const { data, error } = await supabase
    .from("paiements_abonnement")
    .select("id, fournisseur, plan, periodicite, montant, statut, raison_echec, date_expiration_apres, created_at")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as PaiementAbonnementLigne[];
}

/** Même règle que le serveur (supabase/functions/_shared/telephone.ts), pour l'affichage. */
export function formaterTelephoneBenin(saisie: string): string | null {
  let n = saisie.replace(/\D/g, "");
  if (n.startsWith("00229")) n = n.slice(5);
  else if (n.startsWith("229")) n = n.slice(3);
  if (/^\d{8}$/.test(n)) n = "01" + n;
  return /^01\d{8}$/.test(n) ? n.replace(/(\d{2})(?=\d)/g, "$1 ") : null;
}
