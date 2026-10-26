// Supabase Edge Function : paiement-abonnement
//
// Paiement de l'abonnement AKWEO par le gérant, avec les moyens de paiement
// configurés par le super admin (table moyens_paiement_abonnement) :
//   { action: "initier", moyenId, operateur, plan, periodicite, code?, telephone? }
//       mtn / moov / celtiis → demande envoyée sur le téléphone  → { paiementId }
//       international        → page de paiement FedaPay          → { paiementId, redirection }
//   { action: "statut", paiementId }       → statut relu chez le fournisseur, abonnement prolongé si payé
//   { action: "kkiapay", moyenId, transactionId, plan, periodicite, code? }
//       → vérifie une transaction faite dans la fenêtre Kkiapay
//
// Le prix (offre + code promo) est toujours calculé par la base.
//
// Déploiement : npx supabase functions deploy paiement-abonnement --use-api

import { enTetesCors, reponseJson } from "../_shared/cors.ts";
import { identifierAppelant } from "../_shared/appelant.ts";
import { calculerPrix } from "../_shared/tarifs.ts";
import { ErreurFournisseur, fedapayPageDePaiement, lancerPaiement, lireStatut, telephonePour, type Operateur } from "../_shared/paiementsMarchands.ts";
import { chargerMoyen, commeCompte, verifierKkiapay, type OperateurPlateforme } from "../_shared/paiementsPlateforme.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_URL = (Deno.env.get("APP_URL") || "https://akweo.denistossou.com").replace(/\/$/, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: enTetesCors(req) });
  if (req.method !== "POST") return reponseJson(req, { error: "Méthode non autorisée." }, 405);

  try {
    const auth = await identifierAppelant(req);
    if ("erreur" in auth) return reponseJson(req, { error: auth.erreur }, auth.statut);
    const { admin, profil } = auth;
    if (profil.role !== "gerant") return reponseJson(req, { error: "Seul le gérant peut payer l'abonnement." }, 403);
    const corps = await req.json().catch(() => ({}));

    // ------------------------------------------------------------------
    if (corps.action === "initier") {
      const moyen = await chargerMoyen(admin, corps.moyenId);
      const operateur = corps.operateur as OperateurPlateforme;
      if (!moyen || !moyen.actif || moyen.fournisseur === "kkiapay" || !moyen.operateurs.includes(operateur)) {
        return reponseJson(req, { error: "Ce moyen de paiement n'est pas disponible." }, 400);
      }
      const { prix, erreur } = await calculerPrix(admin, profil.entreprise_id, corps.plan, corps.periodicite, corps.code);
      if (!prix) return reponseJson(req, { error: erreur }, 400);
      const compte = commeCompte(moyen);

      let telephone: string | null = null;
      if (operateur !== "international") {
        telephone = telephonePour(compte, corps.telephone);
        if (!telephone) return reponseJson(req, { error: "Numéro invalide. Exemple : 01 97 00 00 00." }, 400);
        // Anti double clic : même demande encore en attente depuis moins de 2 min.
        const { data: enCours } = await admin.from("paiements_abonnement").select("id")
          .eq("entreprise_id", profil.entreprise_id).eq("moyen_id", moyen.id).eq("telephone", telephone)
          .eq("statut", "en_attente").gte("created_at", new Date(Date.now() - 120_000).toISOString())
          .limit(1).maybeSingle();
        if (enCours) return reponseJson(req, { paiementId: enCours.id, dejaEnCours: true });
      }

      const { data: paiement, error: eIns } = await admin.from("paiements_abonnement").insert({
        entreprise_id: profil.entreprise_id,
        fournisseur: moyen.fournisseur,
        moyen_id: moyen.id,
        operateur,
        plan: corps.plan,
        periodicite: corps.periodicite,
        montant: prix.montant,
        montant_avant_promo: prix.montantBase,
        reduction: prix.reduction,
        code_promo_id: prix.codePromoId,
        devise: moyen.fournisseur === "mtn_momo" && moyen.environnement === "test" ? "EUR" : "XOF",
        telephone,
        cree_par: profil.id,
      }).select("id").single();
      if (eIns || !paiement) return reponseJson(req, { error: "Enregistrement du paiement impossible." }, 500);

      try {
        const description = `Abonnement AKWEO ${prix.offreNom} ${corps.periodicite}`;
        if (operateur === "international") {
          const page = await fedapayPageDePaiement(compte, {
            montant: prix.montant, description,
            urlRetour: `${APP_URL}/paiement?plan=${encodeURIComponent(corps.plan)}&periode=${encodeURIComponent(corps.periodicite)}&retour=${paiement.id}`,
          });
          await admin.from("paiements_abonnement").update({ reference_fournisseur: page.reference }).eq("id", paiement.id);
          return reponseJson(req, { paiementId: paiement.id, redirection: page.url });
        }
        const reference = await lancerPaiement(compte, {
          operateur: operateur as Operateur, montant: prix.montant, telephone: telephone!, reference: paiement.id, description,
        });
        await admin.from("paiements_abonnement").update({ reference_fournisseur: reference }).eq("id", paiement.id);
        return reponseJson(req, { paiementId: paiement.id, montant: prix.montant });
      } catch (e) {
        const raison = e instanceof ErreurFournisseur ? e.message : "Demande non transmise.";
        await admin.from("paiements_abonnement").update({ statut: "echoue", raison_echec: raison, updated_at: new Date().toISOString() }).eq("id", paiement.id);
        throw e;
      }
    }

    // ------------------------------------------------------------------
    if (corps.action === "statut") {
      if (typeof corps.paiementId !== "string" || !UUID.test(corps.paiementId)) return reponseJson(req, { error: "Paiement invalide." }, 400);
      const { data: p } = await admin.from("paiements_abonnement").select("*")
        .eq("id", corps.paiementId).eq("entreprise_id", profil.entreprise_id).maybeSingle();
      if (!p) return reponseJson(req, { error: "Paiement introuvable." }, 404);

      const reponse = () => admin.from("paiements_abonnement").select("statut, raison_echec, date_expiration_apres").eq("id", p.id).single()
        .then(({ data }) => reponseJson(req, { statut: data!.statut, raison: data!.raison_echec, dateExpiration: data!.date_expiration_apres }));

      if (!["en_attente", "expire"].includes(p.statut) || !p.moyen_id || !p.reference_fournisseur) return reponse();
      const moyen = await chargerMoyen(admin, p.moyen_id);
      if (!moyen || moyen.fournisseur === "kkiapay") return reponse();

      const r = await lireStatut(commeCompte(moyen), p.reference_fournisseur);
      if (r.statut === "reussi") {
        const { data: res, error } = await admin.rpc("appliquer_paiement_abonnement", {
          p_paiement_id: p.id, p_montant_confirme: r.montant ?? null, p_reference_fournisseur: null,
        });
        if (error) throw error;
        if (res?.erreur) return reponseJson(req, { statut: "echoue", raison: res.erreur });
      } else if (r.statut === "echoue" || r.statut === "annule") {
        await admin.from("paiements_abonnement").update({ statut: "echoue", raison_echec: r.raison ?? "Paiement non abouti.", updated_at: new Date().toISOString() }).eq("id", p.id);
      } else {
        const delai = p.operateur === "international" ? 60 : 15;
        if (p.statut === "en_attente" && Date.now() - new Date(p.created_at).getTime() > delai * 60_000) {
          await admin.from("paiements_abonnement").update({ statut: "expire", raison_echec: "Paiement non confirmé à temps.", updated_at: new Date().toISOString() }).eq("id", p.id);
        }
      }
      return reponse();
    }

    // ------------------------------------------------------------------
    if (corps.action === "kkiapay") {
      const moyen = await chargerMoyen(admin, corps.moyenId);
      if (!moyen || !moyen.actif || moyen.fournisseur !== "kkiapay") return reponseJson(req, { error: "Ce moyen de paiement n'est pas disponible." }, 400);
      const transactionId = typeof corps.transactionId === "string" ? corps.transactionId.trim().slice(0, 100) : "";
      if (!transactionId) return reponseJson(req, { error: "Transaction manquante." }, 400);
      const { prix, erreur } = await calculerPrix(admin, profil.entreprise_id, corps.plan, corps.periodicite, corps.code);
      if (!prix) return reponseJson(req, { error: erreur }, 400);

      const { data: existant } = await admin.from("paiements_abonnement").select("id, entreprise_id, statut, date_expiration_apres")
        .eq("fournisseur", "kkiapay").eq("reference_fournisseur", transactionId).maybeSingle();
      if (existant) {
        if (existant.entreprise_id === profil.entreprise_id && existant.statut === "reussi") {
          return reponseJson(req, { succes: true, nouvelleDateExpiration: existant.date_expiration_apres });
        }
        return reponseJson(req, { error: "Cette transaction a déjà été utilisée." }, 409);
      }

      const v = await verifierKkiapay(moyen, transactionId);
      if ("cleRefusee" in v) return reponseJson(req, { error: "Configuration Kkiapay invalide : préviens l'administrateur." }, 502);
      if (v.statut !== "SUCCESS") return reponseJson(req, { error: "Le paiement n'a pas été confirmé par Kkiapay." }, 402);
      if (!(v.montant >= prix.montant)) return reponseJson(req, { error: "Le montant payé ne correspond pas à l'offre choisie." }, 402);

      const { data: paiement, error: eIns } = await admin.from("paiements_abonnement").insert({
        entreprise_id: profil.entreprise_id, fournisseur: "kkiapay", moyen_id: moyen.id, operateur: "widget",
        reference_fournisseur: transactionId, plan: corps.plan, periodicite: corps.periodicite,
        montant: prix.montant, montant_avant_promo: prix.montantBase, reduction: prix.reduction,
        code_promo_id: prix.codePromoId, devise: "XOF", cree_par: profil.id,
      }).select("id").single();
      if (eIns || !paiement) {
        const code = (eIns as { code?: string } | null)?.code;
        return reponseJson(req, { error: code === "23505" ? "Cette transaction a déjà été utilisée." : "Enregistrement impossible." }, code === "23505" ? 409 : 500);
      }
      const { data: res, error } = await admin.rpc("appliquer_paiement_abonnement", {
        p_paiement_id: paiement.id, p_montant_confirme: v.montant, p_reference_fournisseur: transactionId,
      });
      if (error) throw error;
      if (res?.erreur) return reponseJson(req, { error: res.erreur }, 402);
      return reponseJson(req, { succes: true, nouvelleDateExpiration: res.date_expiration });
    }

    return reponseJson(req, { error: "Action inconnue." }, 400);
  } catch (e) {
    if (e instanceof ErreurFournisseur) return reponseJson(req, { error: e.message }, 422);
    console.error("paiement-abonnement", e);
    const message = e instanceof Error && /CLE_CHIFFREMENT|Ressaisis/.test(e.message) ? e.message : "Erreur serveur. Réessaie.";
    return reponseJson(req, { error: message }, 500);
  }
});
