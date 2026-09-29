// Supabase Edge Function : verifier-paiement-abonnement (Kkiapay)
//
// Ne JAMAIS faire confiance au seul événement « succès » du widget
// Kkiapay côté navigateur. Cette fonction revérifie la transaction
// auprès de l'API Kkiapay avec la clé privée, puis :
//   - enregistre la transaction dans paiements_abonnement : une même
//     transaction ne peut servir qu'UNE fois (anti-rejeu) ;
//   - prolonge l'abonnement via appliquer_paiement_abonnement()
//     (atomique, idempotent).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enTetesCors, reponseJson } from "../_shared/cors.ts";
import { prixOffre } from "../_shared/tarifs.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: enTetesCors(req) });
  if (req.method !== "POST") return reponseJson(req, { error: "Méthode non autorisée." }, 405);

  try {
    const { transactionId, entrepriseId, plan, periodicite } = await req.json();

    if (typeof transactionId !== "string" || !transactionId || transactionId.length > 100 || !entrepriseId) {
      return reponseJson(req, { error: "Champs manquants." }, 400);
    }
    const montantAttendu = prixOffre(plan, periodicite);
    if (montantAttendu === null) return reponseJson(req, { error: "Offre invalide." }, 400);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return reponseJson(req, { error: "Non authentifié." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const appelant = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const jeton = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await appelant.auth.getUser(jeton);
    if (!user) return reponseJson(req, { error: "Session invalide." }, 401);

    const { data: profil } = await admin
      .from("utilisateurs")
      .select("id, entreprise_id, role")
      .eq("auth_user_id", user.id)
      .single();
    if (!profil || profil.role !== "gerant" || profil.entreprise_id !== entrepriseId) {
      return reponseJson(req, { error: "Seul le gérant de cette entreprise peut renouveler son abonnement." }, 403);
    }

    // Transaction déjà enregistrée ?
    const { data: existant } = await admin
      .from("paiements_abonnement")
      .select("id, entreprise_id, statut, date_expiration_apres")
      .eq("fournisseur", "kkiapay")
      .eq("reference_fournisseur", transactionId)
      .maybeSingle();
    if (existant) {
      if (existant.entreprise_id === profil.entreprise_id && existant.statut === "reussi") {
        // Nouvelle tentative de confirmation (réseau coupé...) : on répond
        // succès sans prolonger une seconde fois.
        return reponseJson(req, { succes: true, nouvelleDateExpiration: existant.date_expiration_apres });
      }
      return reponseJson(req, { error: "Cette transaction a déjà été utilisée." }, 409);
    }

    // Vérification réelle auprès de Kkiapay avec la clé privée.
    const sandbox = Deno.env.get("KKIAPAY_SANDBOX") === "true";
    const reponseKkiapay = await fetch(
      sandbox
        ? "https://api-sandbox.kkiapay.me/api/v1/transactions/status"
        : "https://api.kkiapay.me/api/v1/transactions/status",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": Deno.env.get("KKIAPAY_PRIVATE_KEY")! },
        body: JSON.stringify({ transactionId }),
        signal: AbortSignal.timeout(15000),
      }
    );
    const kkiapay = await reponseKkiapay.json().catch(() => ({}));

    if (kkiapay.status !== "SUCCESS") {
      return reponseJson(req, { error: "Le paiement n'a pas été confirmé par Kkiapay." }, 402);
    }
    if (Number(kkiapay.amount) < montantAttendu) {
      return reponseJson(req, { error: "Le montant payé ne correspond pas à l'offre choisie." }, 402);
    }

    const { data: paiement, error: erreurInsertion } = await admin
      .from("paiements_abonnement")
      .insert({
        entreprise_id: profil.entreprise_id,
        fournisseur: "kkiapay",
        reference_fournisseur: transactionId,
        plan,
        periodicite,
        montant: montantAttendu,
        devise: "XOF",
        cree_par: profil.id,
      })
      .select("id")
      .single();
    if (erreurInsertion || !paiement) {
      // 23505 = course entre deux appels simultanés avec la même transaction.
      const code = (erreurInsertion as { code?: string } | null)?.code;
      return reponseJson(
        req,
        { error: code === "23505" ? "Cette transaction a déjà été utilisée." : "Enregistrement impossible." },
        code === "23505" ? 409 : 500
      );
    }

    const { data: resultat, error: erreurApplication } = await admin.rpc("appliquer_paiement_abonnement", {
      p_paiement_id: paiement.id,
      p_montant_confirme: Number(kkiapay.amount),
      p_reference_fournisseur: transactionId,
    });
    if (erreurApplication) throw erreurApplication;
    if (resultat?.erreur) return reponseJson(req, { error: resultat.erreur }, 402);

    return reponseJson(req, { succes: true, nouvelleDateExpiration: resultat.date_expiration });
  } catch (e) {
    console.error("verifier-paiement-abonnement", e);
    return reponseJson(req, { error: "Erreur serveur pendant la vérification du paiement." }, 500);
  }
});
