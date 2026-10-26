// Supabase Edge Function : comptes-paiement
//
// Le gérant configure les comptes marchands de son entreprise (FedaPay pour
// MTN / Moov / Celtiis, ou API MTN MoMo directe). Les clés sont testées
// auprès du fournisseur, puis chiffrées avant d'être enregistrées.
//
//   { action: "enregistrer", id?, fournisseur, libelle, environnement, operateurs, cles? }
//       cles facultatives lors d'une modification (on garde les anciennes)
//   { action: "tester", id }
//   { action: "basculer", id, actif }
//   { action: "supprimer", id }
//
// Déploiement : npx supabase functions deploy comptes-paiement --use-api

import { enTetesCors, reponseJson } from "../_shared/cors.ts";
import { identifierAppelant } from "../_shared/appelant.ts";
import { chiffrer, dechiffrer } from "../_shared/chiffrement.ts";
import {
  ErreurFournisseur, OPERATEURS_PAR_FOURNISSEUR, testerCompte, validerCles,
  type Cles, type CompteMarchand, type Environnement, type Fournisseur, type Operateur,
} from "../_shared/paiementsMarchands.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLONNES = "id, fournisseur, libelle, environnement, operateurs, actif, apercu_cle, verifie_le, created_at";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: enTetesCors(req) });
  if (req.method !== "POST") return reponseJson(req, { error: "Méthode non autorisée." }, 405);

  try {
    const auth = await identifierAppelant(req);
    if ("erreur" in auth) return reponseJson(req, { error: auth.erreur }, auth.statut);
    const { admin, profil } = auth;
    if (profil.role !== "gerant") {
      return reponseJson(req, { error: "Seul le gérant peut gérer les moyens de paiement." }, 403);
    }
    const entrepriseId = profil.entreprise_id;
    const corps = await req.json().catch(() => ({}));

    async function compteExistant(id: unknown) {
      if (typeof id !== "string" || !UUID.test(id)) return null;
      const { data } = await admin.from("comptes_paiement").select("*").eq("id", id).eq("entreprise_id", entrepriseId).maybeSingle();
      return data;
    }

    // ------------------------------------------------------------------
    if (corps.action === "enregistrer") {
      const fournisseur = corps.fournisseur as Fournisseur;
      if (!(fournisseur in OPERATEURS_PAR_FOURNISSEUR)) return reponseJson(req, { error: "Fournisseur inconnu." }, 400);
      const environnement: Environnement = corps.environnement === "production" ? "production" : "test";
      const autorises = OPERATEURS_PAR_FOURNISSEUR[fournisseur];
      const operateurs = Array.from(new Set((Array.isArray(corps.operateurs) ? corps.operateurs : [])
        .filter((o: unknown): o is Operateur => typeof o === "string" && autorises.includes(o as Operateur))));
      if (operateurs.length === 0) return reponseJson(req, { error: "Choisis au moins un opérateur." }, 400);
      const libelle = (typeof corps.libelle === "string" ? corps.libelle.trim() : "").slice(0, 60)
        || (fournisseur === "fedapay" ? "FedaPay" : "MTN MoMo");

      const existant = corps.id ? await compteExistant(corps.id) : null;
      if (corps.id && !existant) return reponseJson(req, { error: "Compte introuvable." }, 404);
      if (existant && existant.fournisseur !== fournisseur) {
        return reponseJson(req, { error: "On ne peut pas changer le fournisseur d'un compte : crée un nouveau compte." }, 400);
      }

      const id = existant?.id ?? crypto.randomUUID();
      let cles: Cles;
      let apercu: string = existant?.apercu_cle ?? "";
      const nouvellesCles = corps.cles && Object.values(corps.cles).some((v) => typeof v === "string" && v.trim());
      if (nouvellesCles) {
        ({ cles, apercu } = validerCles(fournisseur, environnement, corps.cles));
      } else if (existant) {
        const { data: secret } = await admin.from("comptes_paiement_secrets").select("cles_chiffrees").eq("compte_id", id).single();
        cles = await dechiffrer<Cles>(secret!.cles_chiffrees, id);
        if (existant.environnement !== environnement) validerCles(fournisseur, environnement, cles); // cohérence clé / environnement
      } else {
        return reponseJson(req, { error: "Saisis les clés du compte." }, 400);
      }

      // Test réel auprès du fournisseur AVANT d'enregistrer.
      await testerCompte({ id, fournisseur, environnement, cles } as CompteMarchand);

      const ligne = {
        id, entreprise_id: entrepriseId, fournisseur, libelle, environnement, operateurs,
        apercu_cle: apercu, verifie_le: new Date().toISOString(), updated_at: new Date().toISOString(),
        ...(existant ? {} : { cree_par: profil.id, actif: true }),
      };
      const { error: e1 } = await admin.from("comptes_paiement").upsert(ligne);
      if (e1) throw e1;
      if (nouvellesCles) {
        const { error: e2 } = await admin.from("comptes_paiement_secrets")
          .upsert({ compte_id: id, cles_chiffrees: await chiffrer(cles, id), updated_at: new Date().toISOString() });
        if (e2) throw e2;
      }
      const { data } = await admin.from("comptes_paiement").select(COLONNES).eq("id", id).single();
      return reponseJson(req, { compte: data });
    }

    // ------------------------------------------------------------------
    if (corps.action === "tester") {
      const compte = await compteExistant(corps.id);
      if (!compte) return reponseJson(req, { error: "Compte introuvable." }, 404);
      const { data: secret } = await admin.from("comptes_paiement_secrets").select("cles_chiffrees").eq("compte_id", compte.id).single();
      const cles = await dechiffrer<Cles>(secret!.cles_chiffrees, compte.id);
      await testerCompte({ ...compte, cles });
      await admin.from("comptes_paiement").update({ verifie_le: new Date().toISOString() }).eq("id", compte.id);
      return reponseJson(req, { ok: true });
    }

    // ------------------------------------------------------------------
    if (corps.action === "basculer") {
      const compte = await compteExistant(corps.id);
      if (!compte) return reponseJson(req, { error: "Compte introuvable." }, 404);
      const { data } = await admin.from("comptes_paiement")
        .update({ actif: corps.actif === true, updated_at: new Date().toISOString() })
        .eq("id", compte.id).select(COLONNES).single();
      return reponseJson(req, { compte: data });
    }

    // ------------------------------------------------------------------
    if (corps.action === "supprimer") {
      const compte = await compteExistant(corps.id);
      if (!compte) return reponseJson(req, { error: "Compte introuvable." }, 404);
      // L'historique des paiements est conservé (compte_id passe à null).
      const { error } = await admin.from("comptes_paiement").delete().eq("id", compte.id);
      if (error) throw error;
      return reponseJson(req, { ok: true });
    }

    return reponseJson(req, { error: "Action inconnue." }, 400);
  } catch (e) {
    if (e instanceof ErreurFournisseur) return reponseJson(req, { error: e.message }, 422);
    console.error("comptes-paiement", e);
    const message = e instanceof Error && /CLE_CHIFFREMENT|Ressaisis/.test(e.message) ? e.message : "Erreur serveur. Réessaie.";
    return reponseJson(req, { error: message }, 500);
  }
});
