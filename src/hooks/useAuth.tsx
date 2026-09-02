import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import type { Entreprise, Utilisateur } from "../types";

interface ContexteAuth {
  session: Session | null;
  utilisateur: Utilisateur | null;
  entreprise: Entreprise | null;
  chargement: boolean;
  connexion: (email: string, motDePasse: string) => Promise<{ erreur: string | null }>;
  deconnexion: () => Promise<void>;
}

const AuthContext = createContext<ContexteAuth | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [chargement, setChargement] = useState(true);

  async function chargerProfil(userId: string) {
    const { data: profil } = await supabase
      .from("utilisateurs")
      .select("*")
      .eq("auth_user_id", userId)
      .single();

    if (profil) {
      setUtilisateur(profil as Utilisateur);
      const { data: entrepriseData } = await supabase
        .from("entreprises")
        .select("*")
        .eq("id", (profil as Utilisateur).entreprise_id)
        .single();
      setEntreprise(entrepriseData as Entreprise);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) await chargerProfil(session.user.id);
      setChargement(false);
    });

    const { data: abonnement } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          await chargerProfil(session.user.id);
        } else {
          setUtilisateur(null);
          setEntreprise(null);
        }
      }
    );

    return () => abonnement.subscription.unsubscribe();
  }, []);

  async function connexion(email: string, motDePasse: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    });
    return { erreur: error ? traduireErreurAuth(error.message) : null };
  }

  async function deconnexion() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ session, utilisateur, entreprise, chargement, connexion, deconnexion }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function traduireErreurAuth(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "Email ou mot de passe incorrect.";
  }
  return "Une erreur est survenue. Réessaie dans un instant.";
}

export function useAuth(): ContexteAuth {
  const contexte = useContext(AuthContext);
  if (!contexte) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return contexte;
}
