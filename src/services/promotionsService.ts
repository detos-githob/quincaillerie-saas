import { supabase } from "../lib/supabaseClient";

export interface AgentCommercial {
  id: string;
  auth_user_id: string | null;
  nom: string;
  email: string;
  telephone: string | null;
  taux_commission: number;
  actif: boolean;
  created_at: string;
}

export interface CodePromo {
  id: string;
  code: string;
  agent_id: string | null;
  type_reduction: "pourcentage" | "montant";
  valeur: number;
  offres: string[] | null;
  periodicites: string[] | null;
  premier_paiement_seulement: boolean;
  date_debut: string | null;
  date_fin: string | null;
  max_utilisations: number | null;
  utilisations: number;
  actif: boolean;
  created_at: string;
}

export interface StatistiquesPromotions {
  codes: { id: string; code: string; agent_id: string | null; utilisations: number; chiffre_affaires: number; reductions: number }[];
  agents: { agent_id: string; commerces: number; commission_due: number; commission_payee: number }[];
}

export interface CommissionAdmin {
  id: string;
  agent_id: string;
  agent: string;
  entreprise: string;
  montant_base: number;
  taux: number;
  montant: number;
  statut: "due" | "payee";
  created_at: string;
  payee_le: string | null;
}

export interface ApercuPrix {
  montant?: number;
  montant_base?: number;
  reduction?: number;
  offre_nom?: string;
  code?: string;
  description_reduction?: string;
  erreur?: string;
}

/** Prix calculé par le serveur (offre + code promo), pour l'affichage. */
export async function apercuPrix(plan: string, periodicite: string, code: string | null): Promise<ApercuPrix> {
  const { data, error } = await supabase.rpc("apercu_prix_abonnement", {
    p_plan: plan,
    p_periodicite: periodicite,
    p_code: code || null,
  });
  if (error) throw error;
  return data as ApercuPrix;
}

// ---------------------------------------------------------------------
// Code transmis par un agent (lien ?code=XXXX) : gardé sur l'appareil
// jusqu'au paiement.
// ---------------------------------------------------------------------
const CLE_CODE = "akweo_code_promo";

export function memoriserCodeDepuisUrl(): void {
  try {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code && /^[A-Za-z0-9-]{3,20}$/.test(code)) localStorage.setItem(CLE_CODE, code.toUpperCase());
  } catch {
    /* stockage indisponible */
  }
}

export function codeMemorise(): string {
  try {
    return localStorage.getItem(CLE_CODE) ?? "";
  } catch {
    return "";
  }
}

export function oublierCodeMemorise(): void {
  try {
    localStorage.removeItem(CLE_CODE);
  } catch {
    /* rien */
  }
}

// ---------------------------------------------------------------------
// Super admin
// ---------------------------------------------------------------------
export async function listerAgents(): Promise<AgentCommercial[]> {
  const { data, error } = await supabase.from("agents_commerciaux").select("*").order("nom");
  if (error) throw error;
  return (data as AgentCommercial[]).map((a) => ({ ...a, taux_commission: Number(a.taux_commission) }));
}

export async function creerAgent(params: {
  nom: string;
  email: string;
  telephone: string;
  motDePasse: string;
  tauxCommission: number;
}): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Session expirée, reconnecte-toi.");
  const reponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/creer-agent-commercial`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(params),
  });
  const resultat = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(resultat.error || "Création de l'agent impossible.");
}

export async function modifierAgent(a: Pick<AgentCommercial, "id" | "nom" | "telephone" | "taux_commission" | "actif">) {
  const { error } = await supabase.rpc("admin_enregistrer_agent", {
    p_id: a.id,
    p_nom: a.nom,
    p_telephone: a.telephone ?? "",
    p_taux: a.taux_commission,
    p_actif: a.actif,
  });
  if (error) throw error;
}

export async function listerCodes(): Promise<CodePromo[]> {
  const { data, error } = await supabase.from("codes_promo").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as CodePromo[]).map((c) => ({ ...c, valeur: Number(c.valeur) }));
}

export async function enregistrerCode(code: Partial<CodePromo>): Promise<void> {
  const { error } = await supabase.rpc("admin_enregistrer_code_promo", { p: code });
  if (error) throw error;
}

export async function statistiquesPromotions(): Promise<StatistiquesPromotions> {
  const { data, error } = await supabase.rpc("statistiques_promotions");
  if (error) throw error;
  return data as StatistiquesPromotions;
}

export async function listerCommissionsAdmin(): Promise<CommissionAdmin[]> {
  const { data, error } = await supabase.rpc("admin_lister_commissions");
  if (error) throw error;
  return data as CommissionAdmin[];
}

export async function marquerCommissionsPayees(ids: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("admin_marquer_commissions_payees", { p_ids: ids });
  if (error) throw error;
  return data as number;
}

// ---------------------------------------------------------------------
// Agent connecté
// ---------------------------------------------------------------------
export async function mesCommerces() {
  const { data, error } = await supabase.rpc("mes_commerces_agent");
  if (error) throw error;
  return data as { nom: string; plan: string | null; date_expiration: string | null; inscrit_le: string }[];
}

export async function mesCommissions() {
  const { data, error } = await supabase.rpc("mes_commissions_agent");
  if (error) throw error;
  return data as { entreprise: string; montant_base: number; taux: number; montant: number; statut: string; created_at: string; payee_le: string | null }[];
}

export async function maFicheAgent(authUserId: string): Promise<AgentCommercial | null> {
  const { data, error } = await supabase
    .from("agents_commerciaux")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return (data as AgentCommercial) ?? null;
}
