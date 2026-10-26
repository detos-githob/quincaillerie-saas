// Supabase Edge Function : admin-moyens-paiement
//
// Le SUPER ADMIN gère les moyens de paiement des abonnements AKWEO :
//   { action: "enregistrer", id?, fournisseur, libelle, environnement, operateurs, cles?, cle_publique?, ordre? }
//   { action: "tester", id }
//   { action: "basculer", id, actif }
//   { action: "supprimer", id }
// Les clés sont testées auprès du fournisseur puis chiffrées (AES-256-GCM).
//
// Déploiement : npx supabase functions deploy admin-moyens-paiement --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enTetesCors, reponseJson } from "../_shared/cors.ts";
import { chiffrer, dechiffrer } from "../_shared/chiffrement.ts";
import { ErreurFournisseur, testerCompte, type Cles } from "../_shared/paiementsMarchands.ts";
import {
  OPERATEURS_PLATEFORME, commeCompte, validerClesPlateforme, verifierKkiapay,
  type ClesKkiapay, type FournisseurPlateforme, type MoyenPlateforme, type OperateurPlateforme,
} from "../_shared/paiementsPlateforme.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLONNES = "id, fournisseur, libelle, environnement, operateurs, cle_publique, actif, ordre, apercu_cle, verifie_le, created_at";

async function tester(m: MoyenPlateforme & { cles: Cles | ClesKkiapay }) {
  if (m.fournisseur === "kkiapay") {
    // Transaction fictive : une clé valide renvoie « introuvable », une clé fausse est refusée.
    const r = await verifierKkiapay(m, "akweo-test-connexion");
    if ("cleRefusee" in r) throw new ErreurFournisseur("Clé privée Kkiapay refusée. Vérifie la clé et l'environnement.");
    return;
  }
  await testerCompte(commeCompte(m));
}

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

    async function existant(id: unknown) {
      if (typeof id !== "string" || !UUID.test(id)) return null;
      const { data } = await admin.from("moyens_paiement_abonnement").select("*").eq("id", id).maybeSingle();
      return data as MoyenPlateforme | null;
    }
    async function clesDe(id: string) {
      const { data } = await admin.from("moyens_paiement_abonnement_secrets").select("cles_chiffrees").eq("moyen_id", id).single();
      return dechiffrer<Cles | ClesKkiapay>(data!.cles_chiffrees, id);
    }

    // ------------------------------------------------------------------
    if (corps.action === "enregistrer") {
      const fournisseur = corps.fournisseur as FournisseurPlateforme;
      if (!(fournisseur in OPERATEURS_PLATEFORME)) return reponseJson(req, { error: "Fournisseur inconnu." }, 400);
      const environnement = corps.environnement === "production" ? "production" : "test";
      const autorises = OPERATEURS_PLATEFORME[fournisseur];
      const operateurs = Array.from(new Set((Array.isArray(corps.operateurs) ? corps.operateurs : [])
        .filter((o: unknown): o is OperateurPlateforme => typeof o === "string" && autorises.includes(o as OperateurPlateforme))));
      if (fournisseur === "kkiapay") operateurs.splice(0, operateurs.length, "widget");
      if (fournisseur === "mtn_momo") operateurs.splice(0, operateurs.length, "mtn");
      if (operateurs.length === 0) return reponseJson(req, { error: "Choisis au moins un moyen proposé." }, 400);

      const ancien = corps.id ? await existant(corps.id) : null;
      if (corps.id && !ancien) return reponseJson(req, { error: "Moyen de paiement introuvable." }, 404);
      if (ancien && ancien.fournisseur !== fournisseur) {
        return reponseJson(req, { error: "Le fournisseur ne peut pas être changé : crée un nouveau moyen." }, 400);
      }
      const id = ancien?.id ?? crypto.randomUUID();

      const nouvellesCles = corps.cles && Object.values(corps.cles).some((v) => typeof v === "string" && v.trim());
      let cles: Cles | ClesKkiapay;
      let apercu = (ancien as any)?.apercu_cle ?? "";
      let clePublique: string | null = (ancien?.cle_publique ?? null);
      if (nouvellesCles) {
        const v = validerClesPlateforme(fournisseur, environnement, corps.cles, corps.cle_publique ?? clePublique);
        cles = v.cles; apercu = v.apercu; clePublique = v.clePublique;
      } else if (ancien) {
        cles = await clesDe(id);
        if (fournisseur === "kkiapay" && typeof corps.cle_publique === "string" && corps.cle_publique.trim().length >= 16) {
          clePublique = corps.cle_publique.trim();
        }
      } else {
        return reponseJson(req, { error: "Saisis les clés de ce moyen de paiement." }, 400);
      }

      const libelle = (typeof corps.libelle === "string" ? corps.libelle.trim() : "").slice(0, 60)
        || ({ fedapay: "FedaPay", mtn_momo: "MTN MoMo", kkiapay: "Kkiapay" } as const)[fournisseur];
      const moyen = { id, fournisseur, libelle, environnement, operateurs, cle_publique: clePublique, actif: true } as MoyenPlateforme;
      await tester({ ...moyen, cles });

      const ligne = {
        id, fournisseur, libelle, environnement, operateurs, cle_publique: clePublique, apercu_cle: apercu,
        ordre: Number.isFinite(Number(corps.ordre)) ? Math.round(Number(corps.ordre)) : (ancien as any)?.ordre ?? 0,
        verifie_le: new Date().toISOString(), updated_at: new Date().toISOString(),
        ...(ancien ? {} : { actif: true }),
      };
      const { error: e1 } = await admin.from("moyens_paiement_abonnement").upsert(ligne);
      if (e1) throw e1;
      if (nouvellesCles) {
        const { error: e2 } = await admin.from("moyens_paiement_abonnement_secrets")
          .upsert({ moyen_id: id, cles_chiffrees: await chiffrer(cles, id), updated_at: new Date().toISOString() });
        if (e2) throw e2;
      }
      const { data } = await admin.from("moyens_paiement_abonnement").select(COLONNES).eq("id", id).single();
      return reponseJson(req, { moyen: data });
    }

    // ------------------------------------------------------------------
    if (corps.action === "tester") {
      const m = await existant(corps.id);
      if (!m) return reponseJson(req, { error: "Moyen de paiement introuvable." }, 404);
      await tester({ ...m, cles: await clesDe(m.id) });
      await admin.from("moyens_paiement_abonnement").update({ verifie_le: new Date().toISOString() }).eq("id", m.id);
      return reponseJson(req, { ok: true });
    }

    if (corps.action === "basculer") {
      const m = await existant(corps.id);
      if (!m) return reponseJson(req, { error: "Moyen de paiement introuvable." }, 404);
      const { data } = await admin.from("moyens_paiement_abonnement")
        .update({ actif: corps.actif === true, updated_at: new Date().toISOString() }).eq("id", m.id).select(COLONNES).single();
      return reponseJson(req, { moyen: data });
    }

    if (corps.action === "supprimer") {
      const m = await existant(corps.id);
      if (!m) return reponseJson(req, { error: "Moyen de paiement introuvable." }, 404);
      const { error } = await admin.from("moyens_paiement_abonnement").delete().eq("id", m.id);
      if (error) throw error;
      return reponseJson(req, { ok: true });
    }

    return reponseJson(req, { error: "Action inconnue." }, 400);
  } catch (e) {
    if (e instanceof ErreurFournisseur) return reponseJson(req, { error: e.message }, 422);
    console.error("admin-moyens-paiement", e);
    const message = e instanceof Error && /CLE_CHIFFREMENT|Ressaisis/.test(e.message) ? e.message : "Erreur serveur. Réessaie.";
    return reponseJson(req, { error: message }, 500);
  }
});
