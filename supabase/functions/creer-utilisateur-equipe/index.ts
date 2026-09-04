// Supabase Edge Function : creer-utilisateur-equipe
//
// Rôle : permettre à un gérant de créer un compte (vendeur ou comptable)
// pour un membre de son équipe, SANS exposer la clé service_role dans
// le navigateur. Cette fonction s'exécute côté serveur Supabase et
// vérifie elle-même que l'appelant est bien gérant avant d'agir.
//
// Déploiement : voir les instructions dans README.md (section "Équipe").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { email, motDePasse, nom, role } = await req.json();

    if (!email || !motDePasse || !nom || !role) {
      return reponseErreur("Champs manquants.", 400);
    }
    if (!["vendeur", "comptable"].includes(role)) {
      return reponseErreur("Rôle invalide.", 400);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return reponseErreur("Non authentifié.", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client "appelant" : sert uniquement à vérifier QUI fait la demande,
    // avec ses propres droits (donc soumis aux policies RLS normales).
    const supabaseAppelant = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: erreurUser,
    } = await supabaseAppelant.auth.getUser();
    if (erreurUser || !user) {
      return reponseErreur("Session invalide.", 401);
    }

    const { data: profilAppelant, error: erreurProfil } = await supabaseAppelant
      .from("utilisateurs")
      .select("entreprise_id, role")
      .eq("auth_user_id", user.id)
      .single();

    if (erreurProfil || !profilAppelant) {
      return reponseErreur("Profil introuvable.", 403);
    }
    if (profilAppelant.role !== "gerant") {
      return reponseErreur("Seul un gérant peut créer un compte d'équipe.", 403);
    }

    // Client "admin" : celui-ci utilise la clé service_role, UNIQUEMENT
    // côté serveur (jamais transmise au navigateur), pour créer le
    // compte d'authentification du nouvel employé.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: nouvelUtilisateur, error: erreurCreation } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: motDePasse,
        email_confirm: true,
      });

    if (erreurCreation || !nouvelUtilisateur.user) {
      return reponseErreur(erreurCreation?.message || "Erreur lors de la création du compte.", 400);
    }

    const { error: erreurLien } = await supabaseAdmin.from("utilisateurs").insert({
      entreprise_id: profilAppelant.entreprise_id,
      auth_user_id: nouvelUtilisateur.user.id,
      nom,
      role,
    });

    if (erreurLien) {
      // Compte auth créé mais liaison échouée : on nettoie pour éviter
      // un compte fantôme sans entreprise associée.
      await supabaseAdmin.auth.admin.deleteUser(nouvelUtilisateur.user.id);
      return reponseErreur(erreurLien.message, 400);
    }

    return new Response(JSON.stringify({ succes: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return reponseErreur(String(e), 500);
  }
});

function reponseErreur(message: string, statut: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: statut,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
