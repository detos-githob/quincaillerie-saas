// Supabase Edge Function : verifier-paiement-abonnement
//
// Rôle : ne JAMAIS faire confiance au seul événement "succès" du widget
// Kkiapay côté navigateur (un utilisateur malveillant pourrait le
// simuler). Cette fonction revérifie la transaction directement auprès
// de l'API Kkiapay avec la clé privée (jamais exposée au navigateur),
// puis, seulement si le paiement est confirmé et le montant correct,
// prolonge l'abonnement de l'entreprise.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PRIX: Record<string, { mensuel: number; annuel: number }> = {
  starter: { mensuel: 3000, annuel: 35000 },
  business: { mensuel: 5000, annuel: 55000 },
};

Deno.serve(async (req: Request) => {
  try {
    const { transactionId, entrepriseId, plan, periodicite } = await req.json();

    if (!transactionId || !entrepriseId || !plan || !periodicite) {
      return reponseErreur("Champs manquants.", 400);
    }
    if (!PRIX[plan] || !["mensuel", "annuel"].includes(periodicite)) {
      return reponseErreur("Offre invalide.", 400);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return reponseErreur("Non authentifié.", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAppelant = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: erreurUser,
    } = await supabaseAppelant.auth.getUser();
    if (erreurUser || !user) return reponseErreur("Session invalide.", 401);

    const { data: profil } = await supabaseAppelant
      .from("utilisateurs")
      .select("entreprise_id, role")
      .eq("auth_user_id", user.id)
      .single();

    if (!profil || profil.role !== "gerant" || profil.entreprise_id !== entrepriseId) {
      return reponseErreur("Seul le gérant de cette entreprise peut renouveler son abonnement.", 403);
    }

    // Vérification réelle auprès de Kkiapay avec la clé privée.
    const kkiapayPrivateKey = Deno.env.get("KKIAPAY_PRIVATE_KEY")!;
    const kkiapaySandbox = Deno.env.get("KKIAPAY_SANDBOX") === "true";
    const urlVerification = kkiapaySandbox
      ? "https://api-sandbox.kkiapay.me/api/v1/transactions/status"
      : "https://api.kkiapay.me/api/v1/transactions/status";

    const reponseKkiapay = await fetch(urlVerification, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": kkiapayPrivateKey,
      },
      body: JSON.stringify({ transactionId }),
    });
    const donneesKkiapay = await reponseKkiapay.json();

    if (donneesKkiapay.status !== "SUCCESS") {
      return reponseErreur("Le paiement n'a pas été confirmé par Kkiapay.", 402);
    }

    const montantAttendu = PRIX[plan][periodicite as "mensuel" | "annuel"];
    if (Number(donneesKkiapay.amount) < montantAttendu) {
      return reponseErreur("Le montant payé ne correspond pas à l'offre choisie.", 402);
    }

    // Paiement confirmé : on prolonge l'abonnement. Si l'abonnement
    // était encore actif, on prolonge à partir de sa date d'expiration
    // actuelle (pas depuis aujourd'hui) pour ne pas faire perdre de
    // jours déjà payés.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: entreprise } = await supabaseAdmin
      .from("entreprises")
      .select("date_expiration_abonnement")
      .eq("id", entrepriseId)
      .single();

    const aujourdhui = new Date();
    const dateActuelle =
      entreprise?.date_expiration_abonnement && new Date(entreprise.date_expiration_abonnement) > aujourdhui
        ? new Date(entreprise.date_expiration_abonnement)
        : aujourdhui;

    const nouvelleDate = new Date(dateActuelle);
    if (periodicite === "annuel") {
      nouvelleDate.setFullYear(nouvelleDate.getFullYear() + 1);
    } else {
      nouvelleDate.setMonth(nouvelleDate.getMonth() + 1);
    }

    const { error: erreurMaj } = await supabaseAdmin
      .from("entreprises")
      .update({
        plan_abonnement: plan,
        periodicite_abonnement: periodicite,
        date_expiration_abonnement: nouvelleDate.toISOString().slice(0, 10),
        actif: true,
        derniere_alerte_envoyee: null,
      })
      .eq("id", entrepriseId);

    if (erreurMaj) return reponseErreur(erreurMaj.message, 500);

    return new Response(JSON.stringify({ succes: true, nouvelleDateExpiration: nouvelleDate }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return reponseErreur(String(e), 500);
  }
});

function reponseErreur(message: string, statut: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: statut,
    headers: { "Content-Type": "application/json" },
  });
}
