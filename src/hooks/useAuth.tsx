import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { resoudrePermissions, type PermissionsResolues } from "../lib/permissions";
import { chargerSurchargesUtilisateur } from "../services/permissionsService";
import type { Entreprise, Utilisateur } from "../types";

interface ContexteAuth {
  session: Session | null;
  utilisateur: Utilisateur | null;
  entreprise: Entreprise | null;
  estSuperAdmin: boolean;
  permissions: PermissionsResolues;
  chargement: boolean;
  connexion: (email: string, motDePasse: string) => Promise<{ erreur: string | null }>;
  inscription: (
    email: string,
    motDePasse: string,
    cguVersion: string
  ) => Promise<{ erreur: string | null; confirmationRequise: boolean }>;
  deconnexion: () => Promise<void>;
  rafraichirProfil: () => Promise<void>;
}

const AuthContext = createContext<ContexteAuth | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [estSuperAdmin, setEstSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<PermissionsResolues>(resoudrePermissions(undefined));
  const [chargement, setChargement] = useState(true);
  const [chargementProfil, setChargementProfil] = useState(false);

  async function verifierSuperAdmin() {
    const { data } = await supabase.rpc("est_super_admin");
    setEstSuperAdmin(!!data);
  }

  async function chargerProfil(userId: string) {
    setChargementProfil(true);
    try {
      const { data: profil } = await supabase
        .from("utilisateurs")
        .select("*")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (profil) {
        const profilType = profil as Utilisateur;
        setUtilisateur(profilType);
        const [{ data: entrepriseData }, surcharges] = await Promise.all([
          supabase.from("entreprises").select("*").eq("id", profilType.entreprise_id).single(),
          // Le gérant n'a jamais de surcharge applicable (toujours accès
          // complet) : inutile d'interroger la table pour lui.
          profilType.role === "gerant" ? Promise.resolve({}) : chargerSurchargesUtilisateur(profilType.id),
        ]);
        setEntreprise(entrepriseData as Entreprise);
        setPermissions(resoudrePermissions(profilType.role, surcharges));
      } else {
        // Compte authentifié mais pas encore lié à une entreprise
        // (ex: inscription interrompue avant l'étape finale).
        setUtilisateur(null);
        setEntreprise(null);
        setPermissions(resoudrePermissions(undefined));
      }
    } finally {
      setChargementProfil(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        await Promise.all([chargerProfil(session.user.id), verifierSuperAdmin()]);
      }
      setChargement(false);
    });

    const { data: abonnement } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          await Promise.all([chargerProfil(session.user.id), verifierSuperAdmin()]);
        } else {
          setUtilisateur(null);
          setEntreprise(null);
          setEstSuperAdmin(false);
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

  async function inscription(email: string, motDePasse: string, cguVersion: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: motDePasse,
      options: {
        // Une fois le lien de confirmation cliqué, Supabase redirige ici
        // avec une session déjà valide. LoginPage détecte cette session
        // et renvoie directement vers "/", où ProtectedRoute redirige à
        // son tour vers /completer-inscription tant qu'aucune entreprise
        // n'est encore associée au compte — l'utilisateur peut donc
        // enchaîner sans avoir à ressaisir son mot de passe.
        emailRedirectTo: `${window.location.origin}/login`,
        // Conservé sur le compte pour être reporté sur l'entreprise à sa
        // création (y compris après confirmation de l'email). La preuve
        // de référence reste l'horodatage serveur posé par la RPC
        // enregistrer_acceptation_cgu.
        data: { cgu_version: cguVersion },
      },
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
        estSuperAdmin,
        permissions,
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
    return "Le mot de passe est trop court.";
  }
  if (message.includes("Email not confirmed")) {
    return "Confirme d'abord ton email grâce au lien reçu, puis reconnecte-toi.";
  }
  return "Une erreur est survenue. Réessaie dans un instant.";
}

export function useAuth(): ContexteAuth {
  const contexte = useContext(AuthContext);
  if (!contexte) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return contexte;
}
