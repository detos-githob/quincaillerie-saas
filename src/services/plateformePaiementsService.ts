import { supabase } from "../lib/supabaseClient";

// =====================================================================
// Moyens de paiement des ABONNEMENTS (configurés par le super admin) et
// gestion des comptes inactifs. Les clés ne transitent que vers les Edge
// Functions, qui les testent puis les chiffrent.
// =====================================================================

export type FournisseurPlateforme = "fedapay" | "mtn_momo" | "kkiapay";
export type OperateurPlateforme = "mtn" | "moov" | "celtiis" | "international" | "widget";

export interface MoyenPaiementPlateforme {
  id: string;
  fournisseur: FournisseurPlateforme;
  libelle: string;
  environnement: "test" | "production";
  operateurs: OperateurPlateforme[];
  cle_publique: string | null;
  actif: boolean;
  ordre: number;
  apercu_cle: string | null;
  verifie_le: string | null;
  created_at: string;
}

export const LIBELLES_OPERATEUR: Record<OperateurPlateforme, string> = {
  mtn: "MTN Mobile Money",
  moov: "Moov Money",
  celtiis: "Celtiis Cash",
  international: "Autres pays et cartes bancaires",
  widget: "Fenêtre de paiement Kkiapay",
};

export const COULEURS_OPERATEUR: Record<OperateurPlateforme, string> = {
  mtn: "#FFCB05",
  moov: "#0066B3",
  celtiis: "#0E9F8E",
  international: "#6D5BD0",
  widget: "#1A2238",
};

export const FOURNISSEURS_PLATEFORME: Record<FournisseurPlateforme, { nom: string; operateurs: OperateurPlateforme[]; description: string }> = {
  fedapay: {
    nom: "FedaPay",
    operateurs: ["mtn", "moov", "celtiis", "international"],
    description: "MTN, Moov et Celtiis au Bénin par demande sur le téléphone, plus une page de paiement pour les autres pays de la zone et les cartes Visa / Mastercard.",
  },
  mtn_momo: {
    nom: "MTN MoMo (API directe)",
    operateurs: ["mtn"],
    description: "Identifiants API de ton compte marchand MTN : l'argent arrive directement sur ce compte.",
  },
  kkiapay: {
    nom: "Kkiapay",
    operateurs: ["widget"],
    description: "Fenêtre de paiement Kkiapay (MTN, Moov, carte bancaire…), vérifiée par le serveur.",
  },
};

async function appeler<T>(fonction: string, corps: Record<string, unknown>): Promise<T> {
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
    throw new Error("Pas de connexion internet.");
  }
  const resultat = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(resultat.error || "Erreur inattendue. Réessaie.");
  return resultat as T;
}

// ------------------------------------------------------------ lecture
/** Moyens visibles par l'utilisateur (le gérant ne reçoit que les actifs ; le super admin, tous). */
export async function listerMoyensPlateforme(): Promise<MoyenPaiementPlateforme[]> {
  const { data, error } = await supabase
    .from("moyens_paiement_abonnement")
    .select("id, fournisseur, libelle, environnement, operateurs, cle_publique, actif, ordre, apercu_cle, verifie_le, created_at")
    .order("ordre")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as MoyenPaiementPlateforme[];
}

// ------------------------------------------------------------ super admin
export interface SaisieMoyen {
  id?: string;
  fournisseur: FournisseurPlateforme;
  libelle: string;
  environnement: "test" | "production";
  operateurs: OperateurPlateforme[];
  ordre?: number;
  cle_publique?: string;
  cles?: Record<string, string>;
}

export async function enregistrerMoyenPlateforme(s: SaisieMoyen): Promise<MoyenPaiementPlateforme> {
  return (await appeler<{ moyen: MoyenPaiementPlateforme }>("admin-moyens-paiement", { action: "enregistrer", ...s })).moyen;
}
export async function testerMoyenPlateforme(id: string): Promise<void> {
  await appeler("admin-moyens-paiement", { action: "tester", id });
}
export async function basculerMoyenPlateforme(id: string, actif: boolean): Promise<void> {
  await appeler("admin-moyens-paiement", { action: "basculer", id, actif });
}
export async function supprimerMoyenPlateforme(id: string): Promise<void> {
  await appeler("admin-moyens-paiement", { action: "supprimer", id });
}

// ------------------------------------------------------------ paiement de l'abonnement (gérant)
export async function initierPaiementAbonnement(p: {
  moyenId: string;
  operateur: OperateurPlateforme;
  plan: string;
  periodicite: "mensuel" | "annuel";
  code: string | null;
  telephone?: string;
}): Promise<{ paiementId: string; redirection?: string }> {
  return appeler("paiement-abonnement", { action: "initier", ...p });
}

export async function statutPaiementAbonnement(paiementId: string): Promise<{ statut: string; raison: string | null; dateExpiration: string | null }> {
  return appeler("paiement-abonnement", { action: "statut", paiementId });
}

export async function verifierPaiementKkiapay(p: {
  moyenId: string;
  transactionId: string;
  plan: string;
  periodicite: "mensuel" | "annuel";
  code: string | null;
}): Promise<{ succes: boolean; nouvelleDateExpiration?: string }> {
  return appeler("paiement-abonnement", { action: "kkiapay", ...p });
}

// ------------------------------------------------------------ comptes inactifs
export interface EntrepriseInactive {
  id: string;
  nom: string;
  plan_abonnement: string | null;
  actif: boolean;
  date_expiration: string | null;
  jours_depuis_expiration: number | null;
  created_at: string;
  nb_utilisateurs: number;
  nb_ventes: number;
  derniere_vente: string | null;
  derniere_connexion: string | null;
  telephone: string | null;
  email: string | null;
}

export async function listerEntreprisesInactives(jours: number): Promise<EntrepriseInactive[]> {
  const { data, error } = await supabase.rpc("admin_entreprises_inactives", { p_jours: jours });
  if (error) throw error;
  return (data ?? []) as EntrepriseInactive[];
}

export async function supprimerEntrepriseInactive(entrepriseId: string, nomConfirme: string): Promise<{ nom: string; comptesEfface: number }> {
  return appeler("admin-supprimer-entreprise", { entrepriseId, nomConfirme });
}

export interface SuppressionJournal {
  id: string;
  nom: string;
  plan_abonnement: string | null;
  nb_utilisateurs: number | null;
  nb_ventes: number | null;
  supprime_le: string;
}

export async function listerJournalSuppressions(): Promise<SuppressionJournal[]> {
  const { data, error } = await supabase
    .from("journal_suppressions_entreprises")
    .select("id, nom, plan_abonnement, nb_utilisateurs, nb_ventes, supprime_le")
    .order("supprime_le", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as SuppressionJournal[];
}
