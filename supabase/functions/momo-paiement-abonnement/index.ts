// Supabase Edge Function : momo-paiement-abonnement
//
// Paiement de l'abonnement par l'API MTN MoMo (produit Collections).
// Appelée par le navigateur du gérant (JWT Supabase obligatoire).
//
//   { action: "initier", plan, periodicite, telephone }
//       → enregistre le paiement puis envoie la demande sur le téléphone.
//   { action: "statut", paiementId }
//       → relit le statut réel chez MTN ; prolonge l'abonnement si payé.
//   { action: "reconcilier" }
//       → revérifie les paiements en attente des dernières 48 h (cas où
//         le gérant a fermé la page avant la confirmation).
//
// Le prix (offre + code promo) est calculé par la base, jamais par le navigateur.
//
// Déploiement : supabase functions deploy momo-paiement-abonnement

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enTetesCors, reponseJson } from "../_shared/cors.ts";
import { calculerPrix } from "../_shared/tarifs.ts";
import { MOMO_DEVISE, MOMO_SANDBOX, demanderPaiement } from "../_shared/momo.ts";
import { normaliserTelephoneBenin } from "../_shared/telephone.ts";
import { synchroniserPaiementMomo, type PaiementAbonnement } from "../_shared/synchroniserPaiement.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const jeton = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await appelant.auth.getUser(jeton);
    if (!user) return reponseJson(req, { error: "Session invalide." }, 401);

    const { data: profil } = await admin
      .from("utilisateurs")
      .select("id, entreprise_id, role, actif")
      .eq("auth_user_id", user.id)
      .single();
    if (!profil || profil.role !== "gerant" || profil.actif === false) {
      return reponseJson(req, { error: "Seul le gérant peut payer l'abonnement." }, 403);
    }

    const corps = await req.json().catch(() => ({}));

    // ------------------------------------------------------------------
    if (corps.action === "initier") {
      const { prix, erreur: erreurPrix } = await calculerPrix(
        admin, profil.entreprise_id, corps.plan, corps.periodicite, corps.code
      );
      if (!prix) return reponseJson(req, { error: erreurPrix }, 400);
      const montant = prix.montant;

      const telephone = normaliserTelephoneBenin(corps.telephone, MOMO_SANDBOX);
      if (!telephone) {
        return reponseJson(req, { error: "Numéro MTN invalide. Saisis ton numéro à 10 chiffres (01XXXXXXXX)." }, 400);
      }

      // Anti double-clic : une seule demande en attente à la fois.
      const { data: enCours } = await admin
        .from("paiements_abonnement")
        .select("id")
        .eq("entreprise_id", profil.entreprise_id)
        .eq("fournisseur", "mtn_momo")
        .eq("statut", "en_attente")
        .gte("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();
      if (enCours) {
        return reponseJson(req, { paiementId: enCours.id, dejaEnCours: true });
      }

      const { data: paiement, error: erreurInsertion } = await admin
        .from("paiements_abonnement")
        .insert({
          entreprise_id: profil.entreprise_id,
          fournisseur: "mtn_momo",
          plan: corps.plan,
          periodicite: corps.periodicite,
          montant,
          montant_avant_promo: prix.montantBase,
          reduction: prix.reduction,
          code_promo_id: prix.codePromoId,
          devise: MOMO_DEVISE,
          telephone,
          cree_par: profil.id,
        })
        .select("id")
        .single();
      if (erreurInsertion || !paiement) return reponseJson(req, { error: "Enregistrement du paiement impossible." }, 500);

      const callbackUrl =
        Deno.env.get("MOMO_CALLBACK_ACTIF") === "true"
          ? `${supabaseUrl}/functions/v1/momo-callback?ref=${paiement.id}`
          : undefined;

      try {
        await demanderPaiement({
          referenceId: paiement.id,
          montant,
          telephone,
          messagePayeur: `Abonnement Akweo ${prix.offreNom} ${corps.periodicite}`,
          notePayee: `Akweo ${profil.entreprise_id.slice(0, 8)}`,
          callbackUrl,
        });
      } catch (e) {
        console.error("requesttopay", e);
        await admin
          .from("paiements_abonnement")
          .update({ statut: "echoue", raison_echec: "Demande non transmise à MTN.", updated_at: new Date().toISOString() })
          .eq("id", paiement.id);
        return reponseJson(req, { error: "MTN Mobile Money ne répond pas. Réessaie dans quelques minutes." }, 502);
      }

      return reponseJson(req, { paiementId: paiement.id, montant, devise: MOMO_DEVISE });
    }

    // ------------------------------------------------------------------
    if (corps.action === "statut") {
      if (typeof corps.paiementId !== "string" || !UUID.test(corps.paiementId)) {
        return reponseJson(req, { error: "Paiement invalide." }, 400);
      }
      const { data: paiement } = await admin
        .from("paiements_abonnement")
        .select("*")
        .eq("id", corps.paiementId)
        .eq("entreprise_id", profil.entreprise_id) // isolation : seulement ses paiements
        .single();
      if (!paiement) return reponseJson(req, { error: "Paiement introuvable." }, 404);

      const apres = await synchroniserPaiementMomo(admin, paiement as PaiementAbonnement);
      return reponseJson(req, {
        statut: apres.statut,
        raison: apres.raison_echec,
        dateExpiration: apres.date_expiration_apres,
      });
    }

    // ------------------------------------------------------------------
    if (corps.action === "reconcilier") {
      const { data: enAttente } = await admin
        .from("paiements_abonnement")
        .select("*")
        .eq("entreprise_id", profil.entreprise_id)
        .eq("fournisseur", "mtn_momo")
        .in("statut", ["en_attente", "expire"])
        .gte("created_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString())
        .limit(10);
      let reussis = 0;
      for (const p of enAttente ?? []) {
        try {
          const apres = await synchroniserPaiementMomo(admin, p as PaiementAbonnement);
          if (apres.statut === "reussi") reussis++;
        } catch (e) {
          console.error("reconcilier", p.id, e);
        }
      }
      return reponseJson(req, { reussis });
    }

    return reponseJson(req, { error: "Action inconnue." }, 400);
  } catch (e) {
    // Détail technique dans les logs Supabase, message neutre au client.
    console.error("momo-paiement-abonnement", e);
    return reponseJson(req, { error: "Erreur serveur pendant le paiement. Réessaie." }, 500);
  }
});
