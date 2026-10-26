// Supabase Edge Function : admin-supprimer-entreprise
//
// Le SUPER ADMIN supprime un compte d'entreprise INACTIF (suspendu, ou
// abonnement expiré depuis 30 jours au moins) :
//   { entrepriseId, nomConfirme }
// 1. La base vérifie les garde-fous, journalise et supprime toutes les données
//    (fonction admin_supprimer_entreprise, appelée avec le jeton du super admin).
// 2. Les comptes de connexion des membres sont ensuite effacés (service role).
//
// Déploiement : npx supabase functions deploy admin-supprimer-entreprise --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enTetesCors, reponseJson } from "../_shared/cors.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: enTetesCors(req) });
  if (req.method !== "POST") return reponseJson(req, { error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return reponseJson(req, { error: "Non authentifié." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const appelant = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await appelant.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (!user) return reponseJson(req, { error: "Session invalide." }, 401);
    const { data: estAdmin } = await appelant.rpc("est_super_admin");
    if (estAdmin !== true) return reponseJson(req, { error: "Accès réservé aux administrateurs." }, 403);

    const corps = await req.json().catch(() => ({}));
    if (typeof corps.entrepriseId !== "string" || !UUID.test(corps.entrepriseId)) {
      return reponseJson(req, { error: "Entreprise invalide." }, 400);
    }

    // Avec le jeton du super admin : la fonction vérifie elle-même ses droits.
    const { data, error } = await appelant.rpc("admin_supprimer_entreprise", {
      p_entreprise_id: corps.entrepriseId,
      p_nom_confirme: typeof corps.nomConfirme === "string" ? corps.nomConfirme : "",
    });
    if (error) return reponseJson(req, { error: error.message }, 400);

    const ids: string[] = (data?.auth_user_ids ?? []).filter((id: unknown) => typeof id === "string" && id !== user.id);
    let comptesEfface = 0;
    for (const id of ids) {
      const { error: e } = await admin.auth.admin.deleteUser(id);
      if (e) console.error("deleteUser", id, e.message);
      else comptesEfface++;
    }
    return reponseJson(req, {
      ok: true, nom: data.nom, nbVentes: data.nb_ventes, nbUtilisateurs: data.nb_utilisateurs, comptesEfface,
    });
  } catch (e) {
    console.error("admin-supprimer-entreprise", e);
    return reponseJson(req, { error: "Erreur serveur. Réessaie." }, 500);
  }
});
