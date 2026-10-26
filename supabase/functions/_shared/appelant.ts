// Identification de l'appelant d'une Edge Function (JWT Supabase obligatoire).
// L'entreprise vient TOUJOURS du profil en base, jamais du corps de la requête.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface Profil {
  id: string;
  entreprise_id: string;
  role: "gerant" | "comptable" | "magasinier" | "vendeur";
  actif: boolean | null;
}

export async function identifierAppelant(req: Request): Promise<{ admin: SupabaseClient; profil: Profil } | { erreur: string; statut: number }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { erreur: "Non authentifié.", statut: 401 };
  const url = Deno.env.get("SUPABASE_URL")!;
  const appelant = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = await appelant.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!user) return { erreur: "Session invalide.", statut: 401 };
  const { data: profil } = await admin
    .from("utilisateurs")
    .select("id, entreprise_id, role, actif")
    .eq("auth_user_id", user.id)
    .single();
  if (!profil || profil.actif === false) return { erreur: "Compte inactif ou introuvable.", statut: 403 };
  return { admin, profil: profil as Profil };
}

/** Le module « vente » est-il accessible en écriture (rôle + personnalisation du gérant) ? */
export async function peutVendre(admin: SupabaseClient, profil: Profil): Promise<boolean> {
  if (profil.role === "gerant") return true;
  const { data } = await admin
    .from("permissions_utilisateur")
    .select("niveau")
    .eq("utilisateur_id", profil.id)
    .eq("module", "vente")
    .maybeSingle();
  if (data?.niveau) return data.niveau === "ecriture";
  return profil.role === "vendeur";
}
