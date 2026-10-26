// Moyens de paiement des ABONNEMENTS AKWEO, configurés par le super admin
// (table moyens_paiement_abonnement). Réutilise les connecteurs FedaPay et
// MTN MoMo des ventes et ajoute Kkiapay (fenêtre de paiement côté navigateur,
// vérification côté serveur avec la clé privée).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dechiffrer } from "./chiffrement.ts";
import { ErreurFournisseur, validerCles, type Cles, type CompteMarchand } from "./paiementsMarchands.ts";

export type FournisseurPlateforme = "fedapay" | "mtn_momo" | "kkiapay";
export type OperateurPlateforme = "mtn" | "moov" | "celtiis" | "international" | "widget";

export const OPERATEURS_PLATEFORME: Record<FournisseurPlateforme, OperateurPlateforme[]> = {
  fedapay: ["mtn", "moov", "celtiis", "international"],
  mtn_momo: ["mtn"],
  kkiapay: ["widget"],
};

export interface ClesKkiapay { cle_privee: string }

export interface MoyenPlateforme {
  id: string;
  fournisseur: FournisseurPlateforme;
  libelle: string;
  environnement: "test" | "production";
  operateurs: OperateurPlateforme[];
  cle_publique: string | null;
  actif: boolean;
}

export function validerClesPlateforme(
  fournisseur: FournisseurPlateforme,
  environnement: "test" | "production",
  brutes: unknown,
  clePublique: unknown,
): { cles: Cles | ClesKkiapay; apercu: string; clePublique: string | null } {
  if (fournisseur !== "kkiapay") {
    const { cles, apercu } = validerCles(fournisseur, environnement, brutes);
    return { cles, apercu, clePublique: null };
  }
  const b = (brutes ?? {}) as Record<string, unknown>;
  const privee = typeof b.cle_privee === "string" ? b.cle_privee.trim() : "";
  const publique = typeof clePublique === "string" ? clePublique.trim() : "";
  if (privee.length < 16) throw new ErreurFournisseur("Clé privée Kkiapay invalide.");
  if (publique.length < 16) throw new ErreurFournisseur("Clé publique Kkiapay invalide.");
  return { cles: { cle_privee: privee }, apercu: `${privee.slice(0, 6)}…${privee.slice(-4)}`, clePublique: publique };
}

export async function chargerMoyen(admin: SupabaseClient, id: unknown): Promise<(MoyenPlateforme & { cles: Cles | ClesKkiapay }) | null> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: moyen } = await admin.from("moyens_paiement_abonnement").select("*").eq("id", id).maybeSingle();
  if (!moyen) return null;
  const { data: secret } = await admin.from("moyens_paiement_abonnement_secrets").select("cles_chiffrees").eq("moyen_id", id).maybeSingle();
  if (!secret) return null;
  return { ...(moyen as MoyenPlateforme), cles: await dechiffrer<Cles | ClesKkiapay>(secret.cles_chiffrees, id) };
}

/** Le moyen vu comme un compte marchand FedaPay / MTN (pour les connecteurs communs). */
export function commeCompte(m: MoyenPlateforme & { cles: Cles | ClesKkiapay }): CompteMarchand {
  return { id: m.id, fournisseur: m.fournisseur as "fedapay" | "mtn_momo", environnement: m.environnement, cles: m.cles as Cles };
}

const KKIAPAY_URL = {
  test: Deno.env.get("KKIAPAY_SANDBOX_URL") || "https://api-sandbox.kkiapay.me/api/v1/transactions/status",
  production: "https://api.kkiapay.me/api/v1/transactions/status",
};

/** Statut réel d'une transaction Kkiapay. */
export async function verifierKkiapay(
  m: MoyenPlateforme & { cles: Cles | ClesKkiapay },
  transactionId: string,
): Promise<{ statut: string; montant: number } | { cleRefusee: true }> {
  const reponse = await fetch(KKIAPAY_URL[m.environnement], {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": (m.cles as ClesKkiapay).cle_privee },
    body: JSON.stringify({ transactionId }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!reponse) throw new ErreurFournisseur("Kkiapay ne répond pas. Réessaie.");
  if (reponse.status === 401 || reponse.status === 403) return { cleRefusee: true };
  const d = await reponse.json().catch(() => ({}));
  return { statut: String(d.status ?? ""), montant: Number(d.amount) };
}
