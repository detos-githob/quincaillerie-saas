// Supabase Edge Function : momo-callback
//
// Appelée par MTN quand une demande de paiement se termine. MTN ne
// possède pas de jeton Supabase : cette fonction DOIT être déployée sans
// vérification JWT :
//     supabase functions deploy momo-callback --no-verify-jwt
//
// Sécurité : les rappels MTN ne sont pas signés, donc n'importe qui peut
// appeler cette URL. On n'utilise JAMAIS le contenu du rappel : on en
// extrait seulement la référence, puis on relit le statut réel auprès de
// l'API MTN authentifiée. Un faux rappel ne peut donc rien valider.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { synchroniserPaiementMomo, type PaiementAbonnement } from "../_shared/synchroniserPaiement.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "PUT") return new Response(null, { status: 405 });

  try {
    const url = new URL(req.url);
    let reference = url.searchParams.get("ref");
    if (!reference) {
      const corps = await req.json().catch(() => ({}));
      reference = corps?.externalId ?? null;
    }
    if (!reference || !UUID.test(reference)) return new Response(null, { status: 200 });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: paiement } = await admin
      .from("paiements_abonnement")
      .select("*")
      .eq("id", reference)
      .eq("fournisseur", "mtn_momo")
      .in("statut", ["en_attente", "expire"])
      .maybeSingle();

    if (paiement) await synchroniserPaiementMomo(admin, paiement as PaiementAbonnement);
  } catch (e) {
    console.error("momo-callback", e);
  }
  // Toujours 200 : MTN n'a pas à connaître notre état interne.
  return new Response(null, { status: 200 });
});
