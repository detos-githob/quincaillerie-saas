// Supabase Edge Function : notifier-nouvelle-inscription
//
// Rôle : recevoir les informations d'une entreprise qui vient de
// s'inscrire (appelée par un trigger PostgreSQL AFTER INSERT sur
// `entreprises`, voir migration_notification_inscription.sql) et
// envoyer un email via Brevo à l'éditeur du SaaS pour l'en informer
// immédiatement.
//
// Protégée par un secret partagé (le même CRON_SECRET que
// verifier-abonnements-expiration), pas par l'authentification
// Supabase classique, puisqu'elle est appelée depuis la base de
// données elle-même.

const LABELS_SECTEUR: Record<string, string> = {
  quincaillerie: "Quincaillerie",
  depot_boissons: "Dépôt de boissons",
  alimentation_generale: "Alimentation générale",
  pieces_detachees: "Vente de pièces détachées",
  autre: "Autre",
};

interface PayloadInscription {
  entreprise_id: string;
  nom: string;
  secteur_activite: string;
  secteur_activite_autre: string | null;
  telephone: string | null;
  regime_fiscal: string;
  created_at: string;
}

async function envoyerEmailBrevo(sujet: string, contenuHtml: string) {
  const apiKey = Deno.env.get("BREVO_API_KEY")!;
  const emailDestinataire = Deno.env.get("ADMIN_EMAIL")!;
  const emailExpediteur = Deno.env.get("BREVO_SENDER_EMAIL")!;

  const reponse = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: emailExpediteur, name: "Akweo" },
      to: [{ email: emailDestinataire }],
      subject: sujet,
      htmlContent: contenuHtml,
    }),
  });

  if (!reponse.ok) {
    const texte = await reponse.text();
    throw new Error(`Échec envoi Brevo (${reponse.status}) : ${texte}`);
  }
}

Deno.serve(async (req: Request) => {
  const secretRecu = req.headers.get("x-webhook-secret");
  if (secretRecu !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Non autorisé." }), { status: 401 });
  }

  let payload: PayloadInscription;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide." }), { status: 400 });
  }

  const libelleSecteur =
    payload.secteur_activite === "autre" && payload.secteur_activite_autre
      ? payload.secteur_activite_autre
      : LABELS_SECTEUR[payload.secteur_activite] || payload.secteur_activite;

  const sujet = `🎉 Nouvelle inscription — ${payload.nom}`;
  const contenuHtml = `
    <p>Bonjour,</p>
    <p>Une nouvelle entreprise vient de s'inscrire sur Akweo :</p>
    <ul>
      <li><strong>Nom :</strong> ${payload.nom}</li>
      <li><strong>Secteur d'activité :</strong> ${libelleSecteur}</li>
      <li><strong>Régime fiscal :</strong> ${payload.regime_fiscal}</li>
      <li><strong>Téléphone :</strong> ${payload.telephone || "—"}</li>
      <li><strong>Inscrite le :</strong> ${new Date(payload.created_at).toLocaleString("fr-FR")}</li>
    </ul>
    <p>Retrouve-la dans ton espace admin, section "${libelleSecteur}".</p>
  `;

  try {
    await envoyerEmailBrevo(sujet, contenuHtml);
  } catch (e) {
    console.error("Échec notification nouvelle inscription :", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
