// Crée un API User + API Key MTN MoMo pour la SANDBOX (produit Collections).
//
// Usage (Windows, invite de commandes) :
//   set MOMO_SUBSCRIPTION_KEY=ta_cle_primaire_collections
//   node scripts\momo-sandbox-setup.mjs pinepbsrsjdroijrdxzo.supabase.co
//
// L'argument est l'hôte qui recevra les rappels de MTN (ton projet Supabase).
// La clé est lue dans une variable d'environnement et non en argument
// pour ne pas finir dans l'historique du terminal.
//
// En PRODUCTION, ce script ne sert pas : l'API User et l'API Key sont
// fournis par MTN Bénin via le portail partenaire après validation du
// dossier (« Go Live »).

const BASE = "https://sandbox.momodeveloper.mtn.com";
const cle = process.env.MOMO_SUBSCRIPTION_KEY;
const hote = process.argv[2];

if (!cle || !hote || hote.includes("/")) {
  console.error("Usage : set MOMO_SUBSCRIPTION_KEY=... puis node scripts/momo-sandbox-setup.mjs <projet>.supabase.co");
  console.error("(l'hôte seul, sans https:// ni chemin)");
  process.exit(1);
}

const apiUser = crypto.randomUUID();

const creation = await fetch(`${BASE}/v1_0/apiuser`, {
  method: "POST",
  headers: { "X-Reference-Id": apiUser, "Ocp-Apim-Subscription-Key": cle, "Content-Type": "application/json" },
  body: JSON.stringify({ providerCallbackHost: hote }),
});
if (creation.status !== 201) {
  console.error(`Création de l'API User refusée (${creation.status}) : ${await creation.text()}`);
  console.error("Vérifie que la clé est bien celle du produit COLLECTIONS (et pas Disbursements).");
  process.exit(1);
}

const cleApi = await fetch(`${BASE}/v1_0/apiuser/${apiUser}/apikey`, {
  method: "POST",
  headers: { "Ocp-Apim-Subscription-Key": cle },
});
if (cleApi.status !== 201) {
  console.error(`Génération de l'API Key refusée (${cleApi.status}) : ${await cleApi.text()}`);
  process.exit(1);
}
const { apiKey } = await cleApi.json();

console.log("\nIdentifiants sandbox créés. NE LES PARTAGE AVEC PERSONNE.\n");
console.log("Enregistre-les comme secrets Supabase (une seule ligne) :\n");
console.log(
  `supabase secrets set MOMO_SUBSCRIPTION_KEY=${cle} MOMO_API_USER=${apiUser} MOMO_API_KEY=${apiKey} ` +
    `MOMO_TARGET_ENV=sandbox MOMO_BASE_URL=${BASE} MOMO_CALLBACK_ACTIF=true`
);
console.log("");
