import { supabase } from "../lib/supabaseClient";

// =====================================================================
// Paiements électroniques des VENTES (MTN Mobile Money, Moov Money,
// Celtiis Cash). Les clés des comptes marchands ne transitent que vers
// l'Edge Function comptes-paiement, qui les teste puis les chiffre :
// elles ne sont jamais relues par le navigateur.
// =====================================================================

export type Operateur = "mtn" | "moov" | "celtiis";
export type FournisseurPaiement = "fedapay" | "mtn_momo";
export type StatutPaiementVente = "en_attente" | "reussi" | "echoue" | "expire" | "annule";

export interface ComptePaiement {
  id: string;
  fournisseur: FournisseurPaiement;
  libelle: string;
  environnement: "test" | "production";
  operateurs: Operateur[];
  actif: boolean;
  apercu_cle: string | null;
  verifie_le: string | null;
  created_at: string;
}

export interface PaiementVente {
  id: string;
  operateur: Operateur;
  fournisseur: FournisseurPaiement;
  environnement: "test" | "production";
  montant: number;
  telephone: string;
  statut: StatutPaiementVente;
  raison: string | null;
  vente_id: string | null;
  created_at: string;
  confirme_le: string | null;
}

export const OPERATEURS: Record<Operateur, { nom: string; court: string; couleur: string; texte: string }> = {
  mtn: { nom: "MTN Mobile Money", court: "MTN MoMo", couleur: "#FFCB05", texte: "#1B1B1B" },
  moov: { nom: "Moov Money", court: "Moov Money", couleur: "#0066B3", texte: "#FFFFFF" },
  celtiis: { nom: "Celtiis Cash", court: "Celtiis Cash", couleur: "#0E9F8E", texte: "#FFFFFF" },
};

export const FOURNISSEURS: Record<FournisseurPaiement, { nom: string; operateurs: Operateur[]; description: string }> = {
  fedapay: {
    nom: "FedaPay",
    operateurs: ["mtn", "moov", "celtiis"],
    description: "Un seul compte pour MTN, Moov et Celtiis. L'argent arrive sur ton solde FedaPay, retirable vers ton Mobile Money ou ta banque.",
  },
  mtn_momo: {
    nom: "MTN MoMo (API directe)",
    operateurs: ["mtn"],
    description: "Avec les identifiants API de ton compte marchand MTN. L'argent arrive directement sur ce compte MTN.",
  },
};

async function appeler<T>(fonction: "comptes-paiement" | "paiement-vente", corps: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Session expirée, reconnecte-toi.");
  let reponse: Response;
  try {
    reponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fonction}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(corps),
    });
  } catch {
    throw new Error("Pas de connexion internet : le paiement électronique nécessite une connexion.");
  }
  const resultat = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(resultat.error || "Erreur inattendue. Réessaie.");
  return resultat as T;
}

// ---------------------------------------------------------------- comptes
export async function listerComptesPaiement(): Promise<ComptePaiement[]> {
  const { data, error } = await supabase
    .from("comptes_paiement")
    .select("id, fournisseur, libelle, environnement, operateurs, actif, apercu_cle, verifie_le, created_at")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ComptePaiement[];
}

export interface SaisieCompte {
  id?: string;
  fournisseur: FournisseurPaiement;
  libelle: string;
  environnement: "test" | "production";
  operateurs: Operateur[];
  cles?: Record<string, string>;
}

export async function enregistrerComptePaiement(saisie: SaisieCompte): Promise<ComptePaiement> {
  const r = await appeler<{ compte: ComptePaiement }>("comptes-paiement", { action: "enregistrer", ...saisie });
  return r.compte;
}

export async function testerComptePaiement(id: string): Promise<void> {
  await appeler("comptes-paiement", { action: "tester", id });
}

export async function basculerComptePaiement(id: string, actif: boolean): Promise<ComptePaiement> {
  const r = await appeler<{ compte: ComptePaiement }>("comptes-paiement", { action: "basculer", id, actif });
  return r.compte;
}

export async function supprimerComptePaiement(id: string): Promise<void> {
  await appeler("comptes-paiement", { action: "supprimer", id });
}

// --------------------------------------------------------------- paiements
export async function initierPaiementVente(params: {
  compteId: string;
  operateur: Operateur;
  montant: number;
  telephone: string;
}): Promise<PaiementVente> {
  const r = await appeler<{ paiement: PaiementVente }>("paiement-vente", { action: "initier", ...params });
  return r.paiement;
}

export async function statutPaiementVente(paiementId: string): Promise<PaiementVente> {
  const r = await appeler<{ paiement: PaiementVente }>("paiement-vente", { action: "statut", paiementId });
  return r.paiement;
}

export async function annulerPaiementVente(paiementId: string): Promise<PaiementVente> {
  const r = await appeler<{ paiement: PaiementVente }>("paiement-vente", { action: "annuler", paiementId });
  return r.paiement;
}

export async function listerPaiementsVenteRecents(limite = 20): Promise<PaiementVente[]> {
  const { data, error } = await supabase
    .from("paiements_vente")
    .select("id, operateur, fournisseur, environnement, montant, telephone, statut, raison, vente_id, created_at, confirme_le")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as PaiementVente[];
}
