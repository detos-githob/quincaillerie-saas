// Client minimal de l'API MTN MoMo — produit « Collections ».
//
// Secrets (supabase secrets set ...) — JAMAIS dans le front :
//   MOMO_SUBSCRIPTION_KEY  clé primaire du produit Collections (Ocp-Apim-Subscription-Key)
//   MOMO_API_USER          identifiant API User (UUID)
//   MOMO_API_KEY           clé API de cet API User
//   MOMO_TARGET_ENV        "sandbox" en test, "mtnbenin" en production
//   MOMO_BASE_URL          https://sandbox.momodeveloper.mtn.com  |  https://proxy.momoapi.mtn.com
//   MOMO_CURRENCY          facultatif : EUR en sandbox (imposé par MTN), XOF en production
//   MOMO_CALLBACK_ACTIF    "true" pour demander à MTN d'appeler momo-callback

const BASE_URL = (Deno.env.get("MOMO_BASE_URL") || "https://sandbox.momodeveloper.mtn.com").replace(/\/$/, "");
export const MOMO_ENV = Deno.env.get("MOMO_TARGET_ENV") || "sandbox";
export const MOMO_SANDBOX = MOMO_ENV === "sandbox";
export const MOMO_DEVISE = Deno.env.get("MOMO_CURRENCY") || (MOMO_SANDBOX ? "EUR" : "XOF");

function secret(nom: string): string {
  const valeur = Deno.env.get(nom);
  if (!valeur) throw new Error(`Configuration MTN MoMo incomplète : secret ${nom} manquant.`);
  return valeur;
}

// Jeton d'accès mis en cache le temps de sa validité (1 h chez MTN),
// avec une marge de sécurité d'une minute.
let jetonEnCache: { valeur: string; expireA: number } | null = null;

async function obtenirJeton(): Promise<string> {
  if (jetonEnCache && jetonEnCache.expireA > Date.now()) return jetonEnCache.valeur;
  const identifiants = btoa(`${secret("MOMO_API_USER")}:${secret("MOMO_API_KEY")}`);
  const reponse = await fetch(`${BASE_URL}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${identifiants}`,
      "Ocp-Apim-Subscription-Key": secret("MOMO_SUBSCRIPTION_KEY"),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!reponse.ok) {
    throw new Error(`Authentification MTN refusée (${reponse.status}). Vérifie API User, API Key et clé d'abonnement.`);
  }
  const donnees = await reponse.json();
  jetonEnCache = {
    valeur: donnees.access_token,
    expireA: Date.now() + (Number(donnees.expires_in) || 3600) * 1000 - 60_000,
  };
  return jetonEnCache.valeur;
}

async function enTetes(supplementaires: Record<string, string> = {}): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await obtenirJeton()}`,
    "X-Target-Environment": MOMO_ENV,
    "Ocp-Apim-Subscription-Key": secret("MOMO_SUBSCRIPTION_KEY"),
    ...supplementaires,
  };
}

/** Envoie la demande de paiement sur le téléphone du client (MTN répond 202). */
export async function demanderPaiement(params: {
  referenceId: string;
  montant: number;
  telephone: string;
  messagePayeur: string;
  notePayee: string;
  callbackUrl?: string;
}): Promise<void> {
  const supplementaires: Record<string, string> = {
    "X-Reference-Id": params.referenceId,
    "Content-Type": "application/json",
  };
  if (params.callbackUrl) supplementaires["X-Callback-Url"] = params.callbackUrl;

  const reponse = await fetch(`${BASE_URL}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: await enTetes(supplementaires),
    body: JSON.stringify({
      amount: String(Math.round(params.montant)),
      currency: MOMO_DEVISE,
      externalId: params.referenceId,
      payer: { partyIdType: "MSISDN", partyId: params.telephone },
      payerMessage: params.messagePayeur.slice(0, 160),
      payeeNote: params.notePayee.slice(0, 160),
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (reponse.status !== 202) {
    const detail = await reponse.text().catch(() => "");
    throw new Error(`MTN a refusé la demande (${reponse.status}) ${detail.slice(0, 200)}`);
  }
}

export interface StatutMomo {
  status: "PENDING" | "SUCCESSFUL" | "FAILED";
  amount: string;
  currency: string;
  externalId?: string;
  financialTransactionId?: string;
  reason?: string | { code?: string; message?: string };
}

/** Statut réel d'une demande, lu chez MTN. null si MTN ne la connaît pas. */
export async function consulterPaiement(referenceId: string): Promise<StatutMomo | null> {
  const reponse = await fetch(`${BASE_URL}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: await enTetes(),
    signal: AbortSignal.timeout(15000),
  });
  if (reponse.status === 404) return null;
  if (!reponse.ok) throw new Error(`Lecture du statut MTN impossible (${reponse.status}).`);
  return (await reponse.json()) as StatutMomo;
}

const RAISONS: Record<string, string> = {
  NOT_ENOUGH_FUNDS: "Solde Mobile Money insuffisant.",
  APPROVAL_REJECTED: "Le paiement a été refusé sur le téléphone.",
  REJECTED: "Le paiement a été refusé sur le téléphone.",
  EXPIRED: "La demande a expiré sans être validée.",
  PAYER_NOT_FOUND: "Ce numéro n'a pas de compte MTN Mobile Money.",
  PAYER_LIMIT_REACHED: "Le plafond de ton compte Mobile Money est atteint.",
  NOT_ALLOWED: "MTN n'a pas autorisé ce paiement.",
  INTERNAL_PROCESSING_ERROR: "Erreur temporaire chez MTN. Réessaie dans quelques minutes.",
  SERVICE_UNAVAILABLE: "Le service MTN est momentanément indisponible.",
};

export function raisonLisible(reason: StatutMomo["reason"]): string {
  const code = typeof reason === "string" ? reason : reason?.code;
  if (code && RAISONS[code]) return RAISONS[code];
  return code ? `Paiement refusé par MTN (${code}).` : "Paiement refusé par MTN.";
}
