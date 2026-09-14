// Supabase Edge Function : verifier-abonnements-expiration
//
// Rôle : parcourir toutes les entreprises actives, calculer le statut
// de leur abonnement (identique à la logique du frontend dans
// src/lib/abonnement.ts), et envoyer un email via Brevo à l'éditeur
// du SaaS pour chaque entreprise qui vient d'entrer en zone d'alerte
// ou qui est expirée — au maximum une fois par jour par entreprise.
//
// Déclenchée quotidiennement par une tâche planifiée pg_cron (voir
// migration_notifications.sql). Protégée par un secret partagé
// (CRON_SECRET), pas par l'authentification Supabase classique,
// puisqu'elle est appelée depuis la base de données elle-même.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Entreprise {
  id: string;
  nom: string;
  actif: boolean;
  plan_abonnement: string;
  periodicite_abonnement: "mensuel" | "annuel" | null;
  date_expiration_abonnement: string | null;
  derniere_alerte_envoyee: string | null;
}

function calculerStatut(entreprise: Entreprise): { statut: string; joursRestants: number | null } {
  if (!entreprise.date_expiration_abonnement) {
    return { statut: "illimite", joursRestants: null };
  }
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const expiration = new Date(entreprise.date_expiration_abonnement);
  expiration.setHours(0, 0, 0, 0);

  const joursRestants = Math.round(
    (expiration.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (joursRestants < 0) return { statut: "expire", joursRestants };

  const seuil = entreprise.periodicite_abonnement === "annuel" ? 30 : 7;
  if (joursRestants <= seuil) return { statut: "alerte", joursRestants };

  return { statut: "actif", joursRestants };
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
  const secretRecu = req.headers.get("x-cron-secret");
  if (secretRecu !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Non autorisé." }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: entreprises, error } = await supabase
    .from("entreprises")
    .select("id, nom, actif, plan_abonnement, periodicite_abonnement, date_expiration_abonnement, derniere_alerte_envoyee")
    .eq("actif", true)
    .not("date_expiration_abonnement", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const aujourdhuiISO = new Date().toISOString().slice(0, 10);
  let alertesEnvoyees = 0;

  for (const entreprise of (entreprises || []) as Entreprise[]) {
    const { statut, joursRestants } = calculerStatut(entreprise);
    const dejaAlerteAujourdhui = entreprise.derniere_alerte_envoyee === aujourdhuiISO;

    if ((statut === "alerte" || statut === "expire") && !dejaAlerteAujourdhui) {
      const sujet =
        statut === "expire"
          ? `⛔ Abonnement expiré — ${entreprise.nom}`
          : `⚠️ Abonnement bientôt expiré — ${entreprise.nom}`;

      const contenuHtml = `
        <p>Bonjour,</p>
        <p>L'abonnement de <strong>${entreprise.nom}</strong> ${
        statut === "expire"
          ? `est expiré depuis ${Math.abs(joursRestants!)} jour(s).`
          : `expire dans ${joursRestants} jour(s) (le ${entreprise.date_expiration_abonnement}).`
      }</p>
        <p>Palier : ${entreprise.plan_abonnement} — Périodicité : ${entreprise.periodicite_abonnement || "—"}</p>
        <p>Pense à contacter le gérant pour le renouvellement, ou ajuste l'abonnement depuis ton espace admin.</p>
      `;

      try {
        await envoyerEmailBrevo(sujet, contenuHtml);
        await supabase
          .from("entreprises")
          .update({ derniere_alerte_envoyee: aujourdhuiISO })
          .eq("id", entreprise.id);
        alertesEnvoyees++;
      } catch (e) {
        console.error(`Échec envoi pour ${entreprise.nom} :`, e);
      }
    }
  }

  return new Response(JSON.stringify({ alertesEnvoyees, entreprisesVerifiees: entreprises?.length || 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
