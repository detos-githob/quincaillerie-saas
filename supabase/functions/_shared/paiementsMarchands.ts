// Paiement des VENTES sur le compte marchand de chaque entreprise.
//
// Deux façons de se connecter, choisies par le gérant dans Paramètres :
//   - fedapay  : un seul compte FedaPay (agréé BCEAO) encaisse MTN Mobile Money,
//                Moov Money et Celtiis Cash. L'argent arrive sur le solde FedaPay
//                du commerçant, qu'il retire vers son Mobile Money ou sa banque.
//   - mtn_momo : l'API MTN MoMo « Collections » avec les identifiants propres
//                du commerçant (argent directement sur son compte marchand MTN).
//
// Les clés arrivent ici déchiffrées par l'Edge Function ; elles ne quittent
// jamais le serveur et ne sont jamais renvoyées au navigateur.

import { normaliserTelephoneBenin } from "./telephone.ts";

export type Operateur = "mtn" | "moov" | "celtiis";
export type Fournisseur = "fedapay" | "mtn_momo";
export type Environnement = "test" | "production";
export type StatutPaiement = "en_attente" | "reussi" | "echoue" | "annule";

export interface ClesFedapay { cle_secrete: string }
export interface ClesMtnMomo { cle_abonnement: string; api_user: string; api_key: string }
export type Cles = ClesFedapay | ClesMtnMomo;

export interface CompteMarchand {
  id: string;
  fournisseur: Fournisseur;
  environnement: Environnement;
  cles: Cles;
}

export interface ResultatStatut {
  statut: StatutPaiement;
  raison?: string;
  montant?: number;
}

/** Erreur dont le message peut être montré tel quel au commerçant. */
export class ErreurFournisseur extends Error {}

export const OPERATEURS_PAR_FOURNISSEUR: Record<Fournisseur, Operateur[]> = {
  fedapay: ["mtn", "moov", "celtiis"],
  mtn_momo: ["mtn"],
};

const NOM_OPERATEUR: Record<Operateur, string> = { mtn: "MTN Mobile Money", moov: "Moov Money", celtiis: "Celtiis Cash" };

// ---------------------------------------------------------------------
// Validation des clés saisies par le gérant
// ---------------------------------------------------------------------
function chaine(v: unknown, max = 300): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function validerCles(fournisseur: Fournisseur, environnement: Environnement, brutes: unknown): { cles: Cles; apercu: string } {
  const b = (brutes ?? {}) as Record<string, unknown>;
  if (fournisseur === "fedapay") {
    const cle = chaine(b.cle_secrete);
    if (!/^sk_(sandbox|live)_[A-Za-z0-9_-]{8,}$/.test(cle)) {
      throw new ErreurFournisseur("Clé FedaPay invalide : colle la clé SECRÈTE (elle commence par sk_sandbox_ ou sk_live_).");
    }
    if (environnement === "production" && cle.startsWith("sk_sandbox_")) {
      throw new ErreurFournisseur("Cette clé est une clé de test (sk_sandbox_). Choisis l'environnement « Test » ou colle ta clé sk_live_.");
    }
    if (environnement === "test" && cle.startsWith("sk_live_")) {
      throw new ErreurFournisseur("Cette clé est une clé réelle (sk_live_). Choisis l'environnement « Production ».");
    }
    return { cles: { cle_secrete: cle }, apercu: `${cle.slice(0, 11)}…${cle.slice(-4)}` };
  }
  const cles: ClesMtnMomo = {
    cle_abonnement: chaine(b.cle_abonnement),
    api_user: chaine(b.api_user),
    api_key: chaine(b.api_key),
  };
  if (!/^[0-9a-f]{32}$/i.test(cles.cle_abonnement)) throw new ErreurFournisseur("Clé d'abonnement MTN invalide (32 caractères).");
  if (!/^[0-9a-f-]{36}$/i.test(cles.api_user)) throw new ErreurFournisseur("API User MTN invalide (format UUID).");
  if (cles.api_key.length < 16) throw new ErreurFournisseur("API Key MTN invalide.");
  return { cles, apercu: `${cles.api_user.slice(0, 8)}…` };
}

/** Numéro au format attendu par le fournisseur, ou null s'il est invalide. */
export function telephonePour(compte: Pick<CompteMarchand, "fournisseur" | "environnement">, saisie: unknown): string | null {
  const test = compte.environnement === "test";
  const n = normaliserTelephoneBenin(saisie, test);
  if (!n) return null;
  if (compte.fournisseur === "mtn_momo") return n; // 22901XXXXXXXX
  return "+" + (n.startsWith("229") ? n : "229" + n); // FedaPay : +22901XXXXXXXX
}

// ---------------------------------------------------------------------
// FedaPay
// ---------------------------------------------------------------------
const FEDAPAY_URL: Record<Environnement, string> = {
  test: Deno.env.get("FEDAPAY_SANDBOX_URL") || "https://sandbox-api.fedapay.com/v1",
  production: "https://api.fedapay.com/v1",
};

// Identifiants de méthode « sans redirection » (la documentation FedaPay
// emploie plusieurs noms selon les versions : on essaie dans l'ordre).
const MODES_FEDAPAY: Record<Operateur, string[]> = {
  mtn: ["mtn_open", "mtn"],
  moov: ["moov"],
  celtiis: ["sbin", "celtiis"],
};

async function fedapay(compte: CompteMarchand, chemin: string, init: { method?: string; body?: unknown } = {}) {
  const { cle_secrete } = compte.cles as ClesFedapay;
  let reponse: Response;
  try {
    reponse = await fetch(FEDAPAY_URL[compte.environnement] + chemin, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${cle_secrete}`, "Content-Type": "application/json", Accept: "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ErreurFournisseur("FedaPay ne répond pas. Vérifie la connexion et réessaie.");
  }
  if (reponse.status === 401 || reponse.status === 403) {
    throw new ErreurFournisseur("Clé FedaPay refusée. Vérifie la clé secrète et l'environnement (Test / Production).");
  }
  const texte = await reponse.text();
  let donnees: any = null;
  try { donnees = texte ? JSON.parse(texte) : null; } catch { donnees = { message: texte.slice(0, 200) }; }
  return { statut: reponse.status, donnees };
}

function objetFedapay(donnees: any, nom: string): any {
  return donnees?.[`v1/${nom}`] ?? donnees?.[nom] ?? donnees;
}

function messageFedapay(donnees: any): string {
  const m = donnees?.message || donnees?.error || "";
  const erreurs = donnees?.errors ? Object.values(donnees.errors).flat().join(" ") : "";
  return String([m, erreurs].filter(Boolean).join(" ")).slice(0, 240);
}

async function fedapayLancer(compte: CompteMarchand, p: ParametresPaiement): Promise<string> {
  const base = {
    description: p.description.slice(0, 120),
    amount: Math.round(p.montant),
    currency: { iso: "XOF" },
  };
  const client = { firstname: "Client", lastname: "AKWEO", phone_number: { number: p.telephone, country: "bj" } };
  let creation = await fedapay(compte, "/transactions", { method: "POST", body: { ...base, customer: client } });
  if (creation.statut === 422 || creation.statut === 400) {
    // Certains comptes exigent un e-mail client : on réessaie sans fiche client.
    creation = await fedapay(compte, "/transactions", { method: "POST", body: base });
  }
  if (creation.statut >= 300) {
    throw new ErreurFournisseur(`FedaPay a refusé la transaction. ${messageFedapay(creation.donnees)}`.trim());
  }
  const transaction = objetFedapay(creation.donnees, "transaction");
  const id = transaction?.id;
  if (!id) throw new ErreurFournisseur("Réponse FedaPay inattendue (transaction sans identifiant).");

  const jeton = await fedapay(compte, `/transactions/${id}/token`, { method: "POST" });
  const token = jeton.donnees?.token ?? objetFedapay(jeton.donnees, "token")?.token;
  if (jeton.statut >= 300 || !token) {
    throw new ErreurFournisseur(`FedaPay n'a pas fourni de jeton de paiement. ${messageFedapay(jeton.donnees)}`.trim());
  }

  const corps = { token, phone_number: { number: p.telephone, country: "bj" } };
  let derniereErreur = "";
  for (const mode of MODES_FEDAPAY[p.operateur]) {
    for (const chemin of [`/transactions/${mode}`, `/${mode}`]) {
      const envoi = await fedapay(compte, chemin, { method: "POST", body: corps });
      if (envoi.statut < 300) return String(id);
      derniereErreur = messageFedapay(envoi.donnees);
      const modeInconnu = envoi.statut === 404 || ((envoi.statut === 400 || envoi.statut === 422) && /mode|method|méthode/i.test(derniereErreur));
      if (!modeInconnu) {
        throw new ErreurFournisseur(`${NOM_OPERATEUR[p.operateur]} : demande refusée. ${derniereErreur}`.trim());
      }
    }
  }
  throw new ErreurFournisseur(
    `${NOM_OPERATEUR[p.operateur]} n'est pas activé sur ce compte FedaPay. Active-le dans ton tableau de bord FedaPay. ${derniereErreur}`.trim(),
  );
}

async function fedapayStatut(compte: CompteMarchand, reference: string): Promise<ResultatStatut> {
  const r = await fedapay(compte, `/transactions/${encodeURIComponent(reference)}`);
  if (r.statut === 404) return { statut: "echoue", raison: "Transaction inconnue chez FedaPay." };
  if (r.statut >= 300) throw new ErreurFournisseur(`Lecture du statut FedaPay impossible (${r.statut}).`);
  const t = objetFedapay(r.donnees, "transaction");
  const montant = Number(t?.amount);
  switch (t?.status) {
    case "approved":
    case "transferred":
      return { statut: "reussi", montant };
    case "declined":
      return { statut: "echoue", raison: "Paiement refusé (solde insuffisant ou compte bloqué).", montant };
    case "canceled":
      return { statut: "annule", raison: "Le client a annulé le paiement.", montant };
    case "refunded":
      return { statut: "echoue", raison: "Paiement remboursé au client.", montant };
    default:
      return { statut: "en_attente", montant };
  }
}


/**
 * Page de paiement FedaPay (autres pays de la zone, cartes bancaires…) :
 * le client y choisit lui-même son moyen de paiement. Renvoie la référence
 * de la transaction et l'adresse de la page.
 */
export async function fedapayPageDePaiement(
  compte: CompteMarchand,
  p: { montant: number; description: string; urlRetour: string },
): Promise<{ reference: string; url: string }> {
  const creation = await fedapay(compte, "/transactions", {
    method: "POST",
    body: { description: p.description.slice(0, 120), amount: Math.round(p.montant), currency: { iso: "XOF" }, callback_url: p.urlRetour },
  });
  if (creation.statut >= 300) throw new ErreurFournisseur(`FedaPay a refusé la transaction. ${messageFedapay(creation.donnees)}`.trim());
  const id = objetFedapay(creation.donnees, "transaction")?.id;
  if (!id) throw new ErreurFournisseur("Réponse FedaPay inattendue (transaction sans identifiant).");
  const jeton = await fedapay(compte, `/transactions/${id}/token`, { method: "POST" });
  const url = jeton.donnees?.url ?? objetFedapay(jeton.donnees, "token")?.url;
  if (jeton.statut >= 300 || !url) throw new ErreurFournisseur("FedaPay n'a pas fourni de page de paiement.");
  return { reference: String(id), url: String(url) };
}

// ---------------------------------------------------------------------
// MTN MoMo (identifiants propres au commerçant)
// ---------------------------------------------------------------------
const MTN_URL: Record<Environnement, string> = {
  test: Deno.env.get("MTN_MOMO_SANDBOX_URL") || "https://sandbox.momodeveloper.mtn.com",
  production: "https://proxy.momoapi.mtn.com",
};
const MTN_ENV: Record<Environnement, string> = { test: "sandbox", production: "mtnbenin" };
const MTN_DEVISE: Record<Environnement, string> = { test: "EUR", production: "XOF" };

const jetonsMtn = new Map<string, { valeur: string; expireA: number }>();

async function jetonMtn(compte: CompteMarchand): Promise<string> {
  const c = compte.cles as ClesMtnMomo;
  const cache = jetonsMtn.get(compte.id + c.api_user);
  if (cache && cache.expireA > Date.now()) return cache.valeur;
  let reponse: Response;
  try {
    reponse = await fetch(`${MTN_URL[compte.environnement]}/collection/token/`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${c.api_user}:${c.api_key}`)}`, "Ocp-Apim-Subscription-Key": c.cle_abonnement },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ErreurFournisseur("MTN MoMo ne répond pas. Réessaie dans un instant.");
  }
  if (!reponse.ok) {
    throw new ErreurFournisseur(`Identifiants MTN refusés (${reponse.status}). Vérifie la clé d'abonnement, l'API User et l'API Key.`);
  }
  const d = await reponse.json();
  const valeur = d.access_token as string;
  jetonsMtn.set(compte.id + c.api_user, { valeur, expireA: Date.now() + (Number(d.expires_in) || 3600) * 1000 - 60_000 });
  return valeur;
}

async function enTetesMtn(compte: CompteMarchand, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${await jetonMtn(compte)}`,
    "X-Target-Environment": MTN_ENV[compte.environnement],
    "Ocp-Apim-Subscription-Key": (compte.cles as ClesMtnMomo).cle_abonnement,
    ...extra,
  };
}

const RAISONS_MTN: Record<string, string> = {
  NOT_ENOUGH_FUNDS: "Solde Mobile Money insuffisant.",
  APPROVAL_REJECTED: "Le client a refusé le paiement.",
  REJECTED: "Le client a refusé le paiement.",
  EXPIRED: "La demande a expiré sans être validée.",
  PAYER_NOT_FOUND: "Ce numéro n'a pas de compte MTN Mobile Money.",
  PAYER_LIMIT_REACHED: "Le plafond du compte Mobile Money du client est atteint.",
  NOT_ALLOWED: "MTN n'a pas autorisé ce paiement.",
  INTERNAL_PROCESSING_ERROR: "Erreur temporaire chez MTN. Réessaie.",
  SERVICE_UNAVAILABLE: "Le service MTN est momentanément indisponible.",
};

async function mtnLancer(compte: CompteMarchand, p: ParametresPaiement): Promise<string> {
  const reponse = await fetch(`${MTN_URL[compte.environnement]}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: await enTetesMtn(compte, { "X-Reference-Id": p.reference, "Content-Type": "application/json" }),
    body: JSON.stringify({
      amount: String(Math.round(p.montant)),
      currency: MTN_DEVISE[compte.environnement],
      externalId: p.reference,
      payer: { partyIdType: "MSISDN", partyId: p.telephone },
      payerMessage: p.description.slice(0, 160),
      payeeNote: p.description.slice(0, 160),
    }),
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!reponse) throw new ErreurFournisseur("MTN MoMo ne répond pas. Réessaie.");
  if (reponse.status !== 202) {
    const detail = await reponse.text().catch(() => "");
    throw new ErreurFournisseur(`MTN a refusé la demande (${reponse.status}). ${detail.slice(0, 160)}`.trim());
  }
  return p.reference;
}

async function mtnStatut(compte: CompteMarchand, reference: string): Promise<ResultatStatut> {
  const reponse = await fetch(`${MTN_URL[compte.environnement]}/collection/v1_0/requesttopay/${reference}`, {
    headers: await enTetesMtn(compte),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!reponse) throw new ErreurFournisseur("MTN MoMo ne répond pas.");
  if (reponse.status === 404) return { statut: "en_attente" };
  if (!reponse.ok) throw new ErreurFournisseur(`Lecture du statut MTN impossible (${reponse.status}).`);
  const d = await reponse.json();
  if (d.status === "SUCCESSFUL") {
    if (d.currency !== MTN_DEVISE[compte.environnement] || d.externalId !== reference) {
      return { statut: "echoue", raison: "Réponse MTN incohérente : paiement non validé." };
    }
    return { statut: "reussi", montant: Number(d.amount) };
  }
  if (d.status === "FAILED") {
    const code = typeof d.reason === "string" ? d.reason : d.reason?.code;
    return { statut: "echoue", raison: RAISONS_MTN[code] ?? `Paiement refusé par MTN${code ? ` (${code})` : ""}.` };
  }
  return { statut: "en_attente" };
}

// ---------------------------------------------------------------------
// Interface commune
// ---------------------------------------------------------------------
export interface ParametresPaiement {
  operateur: Operateur;
  montant: number;
  telephone: string;   // déjà normalisé par telephonePour()
  reference: string;   // identifiant AKWEO du paiement (UUID)
  description: string;
}

export async function testerCompte(compte: CompteMarchand): Promise<void> {
  if (compte.fournisseur === "fedapay") {
    const r = await fedapay(compte, "/transactions?per_page=1");
    if (r.statut >= 300) throw new ErreurFournisseur(`FedaPay a répondu ${r.statut}. ${messageFedapay(r.donnees)}`.trim());
    return;
  }
  await jetonMtn(compte);
}

/** Envoie la demande de confirmation sur le téléphone du client. Renvoie la référence du fournisseur. */
export async function lancerPaiement(compte: CompteMarchand, p: ParametresPaiement): Promise<string> {
  if (!OPERATEURS_PAR_FOURNISSEUR[compte.fournisseur].includes(p.operateur)) {
    throw new ErreurFournisseur("Cet opérateur n'est pas disponible avec ce compte.");
  }
  return compte.fournisseur === "fedapay" ? fedapayLancer(compte, p) : mtnLancer(compte, p);
}

export async function lireStatut(compte: CompteMarchand, reference: string): Promise<ResultatStatut> {
  return compte.fournisseur === "fedapay" ? fedapayStatut(compte, reference) : mtnStatut(compte, reference);
}
