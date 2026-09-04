import { supabase } from "../lib/supabaseClient";
import type { Utilisateur } from "../types";

export async function listerEquipe(): Promise<Utilisateur[]> {
  const { data, error } = await supabase.from("utilisateurs").select("*").order("nom");
  if (error) throw error;
  return data as Utilisateur[];
}

/**
 * Crée un compte pour un membre de l'équipe (vendeur ou comptable) en
 * appelant l'Edge Function dédiée, qui seule a le droit de créer un
 * compte d'authentification pour quelqu'un d'autre.
 */
export async function creerMembreEquipe(
  nom: string,
  email: string,
  motDePasse: string,
  role: "vendeur" | "comptable"
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error("Session expirée, reconnecte-toi.");

  const reponse = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/creer-utilisateur-equipe`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email, motDePasse, nom, role }),
    }
  );

  const resultat = await reponse.json();
  if (!reponse.ok) {
    throw new Error(resultat.error || "Erreur lors de la création du compte.");
  }
}
