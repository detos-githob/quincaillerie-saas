import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // On avertit clairement plutôt que de planter silencieusement plus tard.
  console.warn(
    "Variables Supabase manquantes. Copie .env.example en .env et renseigne tes clés de projet."
  );
}

/**
 * Capturé AVANT la création du client : Supabase lit puis efface les
 * jetons présents dans l'URL pendant son initialisation. On retient donc
 * ici si la page a été ouverte depuis un lien de réinitialisation de mot
 * de passe (et l'éventuelle erreur associée, ex : lien expiré). Cela
 * évite qu'un simple utilisateur déjà connecté puisse changer son mot de
 * passe sur /reinitialiser-mot-de-passe sans passer par l'email.
 */
function lireContexteLienAuth() {
  if (typeof window === "undefined") return { recuperation: false, erreur: null as string | null };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const surPageReinit = window.location.pathname === "/reinitialiser-mot-de-passe";
  const recuperation =
    hash.get("type") === "recovery" || (surPageReinit && (query.has("code") || hash.has("access_token")));
  const erreur = hash.get("error_description") || query.get("error_description");
  return { recuperation, erreur: erreur ? erreur.replace(/\+/g, " ") : null };
}

export const contexteLienAuth = lireContexteLienAuth();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
