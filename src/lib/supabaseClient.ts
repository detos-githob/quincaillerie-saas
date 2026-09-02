import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // On avertit clairement plutôt que de planter silencieusement plus tard.
  console.warn(
    "Variables Supabase manquantes. Copie .env.example en .env et renseigne tes clés de projet."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
