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
import { definirEntrepriseCourante, estErreurReseau, supprimerParPrefixe } from "../lib/baseLocale";
import type { Entreprise, Utilisateur } from "../types";

// ---------------------------------------------------------------------
// Mode hors ligne : profil gardé sur l'appareil
// ---------------------------------------------------------------------
// Sans réseau, le chargement du profil échoue. Sans ce cache, l'app
// croirait que le compte n'a pas d'entreprise et renverrait vers
// l'inscription. On garde donc la dernière version connue du profil
// (utilisateur, entreprise, droits) pour chaque compte de l'appareil.
interface ProfilEnCache {
  utilisateur: Utilisateur;
  entreprise: Entreprise;
  surcharges: Parameters<typeof resoudrePermissions>[1];
  estSuperAdmin: boolean;
}
const PREFIXE_PROFIL = "akweo_profil_";

function lireProfilEnCache(userId: string): ProfilEnCache | null {
  try {
    const brut = localStorage.getItem(PREFIXE_PROFIL + userId);
    return brut ? (JSON.parse(brut) as ProfilEnCache) : null;
  } catch {
    return null;
  }
}

/**
 * Session enregistrée par Supabase sur l'appareil. Sans réseau, Supabase
 * ne peut pas renouveler un jeton expiré et répond « pas de session » :
 * on garde alors la session connue pour travailler hors ligne. Le jeton
 * sera renouvelé automatiquement au retour du réseau, avant tout envoi.
 */
function sessionEnregistree(): Session | null {
  try {
    const cle = (supabase.auth as unknown as { storageKey?: string }).storageKey;
    const brut = cle ? localStorage.getItem(cle) : null;
    const s = brut ? JSON.parse(brut) : null;
    return s?.user?.id && s?.refresh_token ? (s as Session) : null;
  } catch {
    return null;
  }
}

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

  async function verifierSuperAdmin(userId: string) {
    const { data, error } = await supabase.rpc("est_super_admin");
    if (error && estErreurReseau(error)) {
      setEstSuperAdmin(!!lireProfilEnCache(userId)?.estSuperAdmin);
      return;
    }
    setEstSuperAdmin(!!data);
  }

  function appliquerProfil(p: ProfilEnCache) {
    setUtilisateur(p.utilisateur);
    setEntreprise(p.entreprise);
    setPermissions(resoudrePermissions(p.utilisateur.role, p.surcharges));
    definirEntrepriseCourante(p.entreprise.id);
  }

  async function chargerProfil(userId: string) {
    setChargementProfil(true);
    try {
      const { data: profil, error: erreurProfil } = await supabase
        .from("utilisateurs")
        .select("*")
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (erreurProfil) throw erreurProfil;

      if (profil) {
        const profilType = profil as Utilisateur;
        const [{ data: entrepriseData, error: erreurEntreprise }, surcharges, admin] = await Promise.all([
          supabase.from("entreprises").select("*").eq("id", profilType.entreprise_id).single(),
          // Le gérant n'a jamais de surcharge applicable (toujours accès
          // complet) : inutile d'interroger la table pour lui.
          profilType.role === "gerant" ? Promise.resolve({}) : chargerSurchargesUtilisateur(profilType.id),
          supabase.rpc("est_super_admin"),
        ]);
        if (erreurEntreprise) throw erreurEntreprise;
        const complet: ProfilEnCache = {
          utilisateur: profilType,
          entreprise: entrepriseData as Entreprise,
          surcharges,
          estSuperAdmin: !!admin.data,
        };
        appliquerProfil(complet);
        localStorage.setItem(PREFIXE_PROFIL + userId, JSON.stringify(complet));
      } else {
        // Compte authentifié mais pas encore lié à une entreprise
        // (ex: inscription interrompue avant l'étape finale).
        setUtilisateur(null);
        setEntreprise(null);
        setPermissions(resoudrePermissions(undefined));
        definirEntrepriseCourante(null);
      }
    } catch (err) {
      const enCache = lireProfilEnCache(userId);
      if (estErreurReseau(err) && enCache) {
        appliquerProfil(enCache);
      } else if (!estErreurReseau(err)) {
        throw err;
      }
      // Réseau absent et aucun profil connu : l'écran de chargement
      // indiquera qu'une première connexion en ligne est nécessaire.
    } finally {
      setChargementProfil(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      // Sans réseau, un jeton expiré ne peut pas être renouvelé : on
      // travaille avec la session connue de l'appareil.
      const effective = session ?? (!navigator.onLine ? sessionEnregistree() : null);
      setSession(effective);
      if (effective?.user) {
        await Promise.all([chargerProfil(effective.user.id), verifierSuperAdmin(effective.user.id)]).catch(
          (e) => console.error("Chargement du profil", e)
        );
      }
      setChargement(false);
    });

    const { data: abonnement } = supabase.auth.onAuthStateChange(async (evenement, session) => {
      if (!session) {
        // Hors ligne, Supabase peut annoncer « pas de session » faute de
        // pouvoir renouveler le jeton : seule une vraie déconnexion vide
        // le profil.
        if (evenement !== "SIGNED_OUT" && sessionEnregistree()) return;
        setSession(null);
        setUtilisateur(null);
        setEntreprise(null);
        setEstSuperAdmin(false);
        definirEntrepriseCourante(null);
        return;
      }
      setSession(session);
      // Renouvellement de jeton : le profil n'a pas changé.
      if (evenement === "TOKEN_REFRESHED") return;
      await Promise.all([chargerProfil(session.user.id), verifierSuperAdmin(session.user.id)]).catch((e) =>
        console.error("Chargement du profil", e)
      );
    });

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
    const userId = session?.user?.id;
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Hors ligne, Supabase ne peut pas prévenir le serveur et garde la
      // session : on la retire nous-mêmes de l'appareil.
      const cle = (supabase.auth as unknown as { storageKey?: string }).storageKey;
      if (cle) localStorage.removeItem(cle);
    }
    setSession(null);
    setUtilisateur(null);
    setEntreprise(null);
    setEstSuperAdmin(false);
    // Données en cache de ce compte (profil, articles, clients). La file
    // des ventes en attente n'est PAS effacée : elle contient de l'argent
    // encaissé, elle sera envoyée à la prochaine connexion de ce compte.
    if (userId) localStorage.removeItem(PREFIXE_PROFIL + userId);
    await supprimerParPrefixe("cache:").catch(() => undefined);
    definirEntrepriseCourante(null);
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
