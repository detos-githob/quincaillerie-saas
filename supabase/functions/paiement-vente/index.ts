// Supabase Edge Function : paiement-vente
//
// Paiement d'une vente par Mobile Money depuis la caisse :
//   { action: "initier", compteId, operateur, montant, telephone }
//       → envoie la demande de confirmation sur le téléphone du client
//   { action: "statut", paiementId }
//       → relit le statut réel chez le fournisseur (jamais celui du navigateur)
//   { action: "annuler", paiementId }
//       → le vendeur arrête d'attendre (revérifié chez le fournisseur avant)
//
// La vente elle-même est créée ensuite par synchroniser_vente(p_paiement_id),
// qui refuse un paiement non confirmé, déjà utilisé ou d'un montant inférieur.
//
// Déploiement : npx supabase functions deploy paiement-vente --use-api

import { enTetesCors, reponseJson } from "../_shared/cors.ts";
import { identifierAppelant, peutVendre } from "../_shared/appelant.ts";
import { dechiffrer } from "../_shared/chiffrement.ts";
import {
  ErreurFournisseur, lancerPaiement, lireStatut, telephonePour,
  type Cles, type CompteMarchand, type Operateur,
} from "../_shared/paiementsMarchands.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELAI_EXPIRATION_MS = 10 * 60 * 1000;
const COLONNES = "id, operateur, fournisseur, environnement, montant, telephone, statut, raison, vente_id, created_at, confirme_le";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: enTetesCors(req) });
  if (req.method !== "POST") return reponseJson(req, { error: "Méthode non autorisée." }, 405);

  try {
    const auth = await identifierAppelant(req);
    if ("erreur" in auth) return reponseJson(req, { error: auth.erreur }, auth.statut);
    const { admin, profil } = auth;
    if (!(await peutVendre(admin, profil))) {
      return reponseJson(req, { error: "Tu n'as pas accès à la vente." }, 403);
    }
    const entrepriseId = profil.entreprise_id;
    const corps = await req.json().catch(() => ({}));

    async function chargerCompte(id: string | null): Promise<CompteMarchand | null> {
      if (!id) return null;
      const { data: compte } = await admin.from("comptes_paiement").select("*")
        .eq("id", id).eq("entreprise_id", entrepriseId).maybeSingle();
      if (!compte) return null;
      const { data: secret } = await admin.from("comptes_paiement_secrets").select("cles_chiffrees").eq("compte_id", id).maybeSingle();
      if (!secret) return null;
      return { ...compte, cles: await dechiffrer<Cles>(secret.cles_chiffrees, id) };
    }

    /** Relit le statut chez le fournisseur et met la ligne à jour. */
    async function actualiser(paiement: any): Promise<any> {
      const aRevoir = ["en_attente", "annule", "expire"].includes(paiement.statut)
        && paiement.reference_fournisseur
        && Date.now() - new Date(paiement.created_at).getTime() < 24 * 3600 * 1000;
      if (!aRevoir) return paiement;
      const compte = await chargerCompte(paiement.compte_id);
      if (!compte) return paiement;

      const r = await lireStatut(compte, paiement.reference_fournisseur);
      const maj: Record<string, unknown> = { mis_a_jour_le: new Date().toISOString() };
      if (r.statut === "reussi") {
        if (r.montant !== undefined && Number.isFinite(r.montant) && r.montant < paiement.montant) {
          Object.assign(maj, { statut: "echoue", raison: `Montant reçu (${r.montant} F) inférieur au montant demandé.` });
        } else {
          Object.assign(maj, { statut: "reussi", raison: null, confirme_le: new Date().toISOString() });
        }
      } else if (r.statut === "echoue" || (r.statut === "annule" && paiement.statut === "en_attente")) {
        Object.assign(maj, { statut: r.statut, raison: r.raison ?? null });
      } else if (paiement.statut === "en_attente" && Date.now() - new Date(paiement.created_at).getTime() > DELAI_EXPIRATION_MS) {
        Object.assign(maj, { statut: "expire", raison: "Le client n'a pas confirmé à temps." });
      }
      const { data } = await admin.from("paiements_vente").update(maj).eq("id", paiement.id).select("*").single();
      return data ?? paiement;
    }

    function exposer(p: any) {
      const { reference_fournisseur: _r, compte_id: _c, entreprise_id: _e, ...reste } = p;
      return reste;
    }

    // ------------------------------------------------------------------
    if (corps.action === "initier") {
      const montant = Math.round(Number(corps.montant));
      if (!Number.isFinite(montant) || montant < 100 || montant > 5_000_000) {
        return reponseJson(req, { error: "Montant invalide (entre 100 F et 5 000 000 F)." }, 400);
      }
      if (typeof corps.compteId !== "string" || !UUID.test(corps.compteId)) {
        return reponseJson(req, { error: "Choisis un moyen de paiement." }, 400);
      }
      const operateur = corps.operateur as Operateur;
      const compte = await chargerCompte(corps.compteId);
      if (!compte || !(compte as any).actif || !(compte as any).operateurs.includes(operateur)) {
        return reponseJson(req, { error: "Ce moyen de paiement n'est pas disponible. Vérifie les Paramètres." }, 400);
      }
      const telephone = telephonePour(compte, corps.telephone);
      if (!telephone) return reponseJson(req, { error: "Numéro invalide. Exemple : 01 97 00 00 00." }, 400);

      // Anti double clic : même demande encore en attente depuis moins de 90 s.
      const { data: recent } = await admin.from("paiements_vente").select(COLONNES)
        .eq("entreprise_id", entrepriseId).eq("telephone", telephone).eq("montant", montant)
        .eq("operateur", operateur).eq("statut", "en_attente")
        .gte("created_at", new Date(Date.now() - 90_000).toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (recent) return reponseJson(req, { paiement: recent });

      const id = crypto.randomUUID();
      const { error: eIns } = await admin.from("paiements_vente").insert({
        id, entreprise_id: entrepriseId, compte_id: compte.id, fournisseur: compte.fournisseur, operateur,
        environnement: compte.environnement, montant, telephone, utilisateur_id: profil.id,
        devise: compte.fournisseur === "mtn_momo" && compte.environnement === "test" ? "EUR" : "XOF",
      });
      if (eIns) throw eIns;

      try {
        const { data: ent } = await admin.from("entreprises").select("nom").eq("id", entrepriseId).single();
        const reference = await lancerPaiement(compte, {
          operateur, montant, telephone, reference: id,
          description: `Achat ${ent?.nom ?? "AKWEO"}`.slice(0, 100),
        });
        const { data } = await admin.from("paiements_vente")
          .update({ reference_fournisseur: reference, mis_a_jour_le: new Date().toISOString() })
          .eq("id", id).select(COLONNES).single();
        return reponseJson(req, { paiement: data });
      } catch (e) {
        const raison = e instanceof ErreurFournisseur ? e.message : "Envoi de la demande impossible.";
        await admin.from("paiements_vente").update({ statut: "echoue", raison, mis_a_jour_le: new Date().toISOString() }).eq("id", id);
        throw e;
      }
    }

    // ------------------------------------------------------------------
    if (corps.action === "statut" || corps.action === "annuler") {
      if (typeof corps.paiementId !== "string" || !UUID.test(corps.paiementId)) {
        return reponseJson(req, { error: "Paiement introuvable." }, 400);
      }
      const { data: paiement } = await admin.from("paiements_vente").select("*")
        .eq("id", corps.paiementId).eq("entreprise_id", entrepriseId).maybeSingle();
      if (!paiement) return reponseJson(req, { error: "Paiement introuvable." }, 404);

      let a_jour = paiement;
      try {
        a_jour = await actualiser(paiement);
      } catch (e) {
        if (!(e instanceof ErreurFournisseur)) throw e;
        if (corps.action === "statut") return reponseJson(req, { paiement: exposer(paiement), avertissement: e.message });
      }

      if (corps.action === "annuler" && a_jour.statut === "en_attente") {
        const { data } = await admin.from("paiements_vente")
          .update({ statut: "annule", raison: "Annulé à la caisse.", mis_a_jour_le: new Date().toISOString() })
          .eq("id", a_jour.id).eq("statut", "en_attente").select("*").single();
        a_jour = data ?? a_jour;
      }
      return reponseJson(req, { paiement: exposer(a_jour) });
    }

    return reponseJson(req, { error: "Action inconnue." }, 400);
  } catch (e) {
    if (e instanceof ErreurFournisseur) return reponseJson(req, { error: e.message }, 422);
    console.error("paiement-vente", e);
    const message = e instanceof Error && /CLE_CHIFFREMENT|Ressaisis/.test(e.message) ? e.message : "Erreur serveur. Réessaie.";
    return reponseJson(req, { error: message }, 500);
  }
});
