// Supabase Edge Function : creer-agent-commercial
//
// Crée le compte de connexion d'un agent commercial (email + mot de
// passe) et sa fiche. Réservé au super admin : la création d'un compte
// d'authentification exige la clé service_role, qui ne quitte jamais le
// serveur.
//
// Déploiement : supabase functions deploy creer-agent-commercial

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enTetesCors, reponseJson } from "../_shared/cors.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CARACTERE_SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|<>?,./`~]/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: enTetesCors(req) });
  if (req.method !== "POST") return reponseJson(req, { error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return reponseJson(req, { error: "Non authentifié." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const appelant = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const jeton = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await appelant.auth.getUser(jeton);
    if (!user) return reponseJson(req, { error: "Session invalide." }, 401);

    const { data: estAdmin } = await appelant.rpc("est_super_admin");
    if (estAdmin !== true) return reponseJson(req, { error: "Accès réservé aux administrateurs." }, 403);

    const corps = await req.json().catch(() => ({}));
    const nom = typeof corps.nom === "string" ? corps.nom.trim() : "";
    const email = typeof corps.email === "string" ? corps.email.trim().toLowerCase() : "";
    const telephone = typeof corps.telephone === "string" ? corps.telephone.trim() : "";
    const motDePasse = typeof corps.motDePasse === "string" ? corps.motDePasse : "";
    const taux = Number(corps.tauxCommission);

    if (nom.length < 2 || nom.length > 80) return reponseJson(req, { error: "Nom invalide." }, 400);
    if (!EMAIL.test(email)) return reponseJson(req, { error: "Email invalide." }, 400);
    if (!Number.isFinite(taux) || taux < 0 || taux > 100) {
      return reponseJson(req, { error: "Le taux de commission doit être entre 0 et 100 %." }, 400);
    }
    if (
      motDePasse.length < 12 || motDePasse.length > 128 || !/[A-Z]/.test(motDePasse) ||
      !/[a-z]/.test(motDePasse) || !/[0-9]/.test(motDePasse) || !CARACTERE_SPECIAL.test(motDePasse)
    ) {
      return reponseJson(req, {
        error: "Mot de passe trop faible : 12 caractères, majuscule, minuscule, chiffre et caractère spécial.",
      }, 400);
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cree, error: erreurCreation } = await admin.auth.admin.createUser({
      email,
      password: motDePasse,
      email_confirm: true,
      user_metadata: { type_compte: "agent_commercial", nom },
    });
    if (erreurCreation || !cree.user) {
      const deja = /already|registered|exists/i.test(erreurCreation?.message ?? "");
      return reponseJson(req, {
        error: deja ? "Un compte existe déjà avec cet email." : "Création du compte impossible.",
      }, 400);
    }

    const { data: agent, error: erreurFiche } = await admin
      .from("agents_commerciaux")
      .insert({ auth_user_id: cree.user.id, nom, email, telephone: telephone || null, taux_commission: taux })
      .select("id")
      .single();
    if (erreurFiche || !agent) {
      // Pas de compte de connexion sans fiche d'agent.
      await admin.auth.admin.deleteUser(cree.user.id);
      return reponseJson(req, { error: "Enregistrement de l'agent impossible." }, 500);
    }

    return reponseJson(req, { agentId: agent.id });
  } catch (e) {
    console.error("creer-agent-commercial", e);
    return reponseJson(req, { error: "Erreur serveur." }, 500);
  }
});
