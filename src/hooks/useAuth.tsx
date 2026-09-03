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
  inscription: (
    email: string,
    motDePasse: string
  ) => Promise<{ erreur: string | null; confirmationRequise: boolean }>;
  deconnexion: () => Promise<void>;
  rafraichirProfil: () => Promise<void>;
}

const AuthContext = createContext<ContexteAuth | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [chargement, setChargement] = useState(true);
  const [chargementProfil, setChargementProfil] = useState(false);

  async function chargerProfil(userId: string) {
    setChargementProfil(true);
    try {
      const { data: profil } = await supabase
        .from("utilisateurs")
        .select("*")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (profil) {
        setUtilisateur(profil as Utilisateur);
        const { data: entrepriseData } = await supabase
          .from("entreprises")
          .select("*")
          .eq("id", (profil as Utilisateur).entreprise_id)
          .single();
        setEntreprise(entrepriseData as Entreprise);
      } else {
        // Compte authentifié mais pas encore lié à une entreprise
        // (ex: inscription interrompue avant l'étape finale).
        setUtilisateur(null);
        setEntreprise(null);
      }
    } finally {
      setChargementProfil(false);
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

  async function inscription(email: string, motDePasse: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: motDePasse,
    });
    if (error) {
      return { erreur: traduireErreurAuth(error.message), confirmationRequise: false };
    }
    // Si le projet Supabase exige la confirmation par email, signUp ne
    // renvoie pas de session utilisable immédiatement.
    const confirmationRequise = !data.session;
    return { erreur: null, confirmationRequise };
  }

  async function deconnexion() {
    await supabase.auth.signOut();
  }

  async function rafraichirProfil() {
    if (session?.user) await chargerProfil(session.user.id);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        utilisateur,
        entreprise,
        chargement: chargement || chargementProfil,
        connexion,
        inscription,
        deconnexion,
        rafraichirProfil,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function traduireErreurAuth(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "Email ou mot de passe incorrect.";
  }
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "Un compte existe déjà avec cet email.";
  }
  if (message.includes("Password should be at least")) {
    return "Le mot de passe doit contenir au moins 6 caractères.";
  }
  return "Une erreur est survenue. Réessaie dans un instant.";
}

export function useAuth(): ContexteAuth {
  const contexte = useContext(AuthContext);
  if (!contexte) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return contexte;
}
