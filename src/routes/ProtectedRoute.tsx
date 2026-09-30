import { lazy, Suspense } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { calculerStatutAbonnement, niveauAcces, routeAutoriseeEnAccesBasique } from "../lib/abonnement";
import { moduleDeLaRoute, peutAcceder, routeParDefaut } from "../lib/permissions";
import type { ReactNode } from "react";

// Pages accessibles même si l'abonnement est expiré, pour permettre au
// gérant de le renouveler sans rester bloqué.
const CHEMINS_EXEMPTES_EXPIRATION = ["/mon-abonnement", "/offres", "/paiement"];

const LandingPage = lazy(() => import("../features/landing/LandingPage").then((m) => ({ default: m.LandingPage })));

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, utilisateur, entreprise, estSuperAdmin, permissions, chargement } = useAuth();
  const location = useLocation();

  if (chargement) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-400 text-sm">
        Chargement...
      </div>
    );
  }

  if (!session) {
    // Visiteur non connecté arrivant sur le domaine : page d'accueil
    // publique. Les autres pages privées renvoient vers la connexion.
    return location.pathname === "/" ? (
      <Suspense fallback={null}>
        <LandingPage />
      </Suspense>
    ) : (
      <Navigate to="/login" replace />
    );
  }

  if (!utilisateur) {
    // Sans réseau, on ne peut pas savoir si le compte a une entreprise :
    // surtout ne pas l'envoyer vers l'inscription.
    if (!navigator.onLine) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 px-6 text-center">
          <div className="max-w-sm space-y-2">
            <p className="font-display text-2xl font-bold text-stone-900">Connexion nécessaire</p>
            <p className="text-sm text-stone-600">
              Cet appareil n'a encore jamais été utilisé en ligne avec ce compte. Connecte-le une première fois à
              internet : il téléchargera tes articles et clients, puis pourra fonctionner hors ligne.
            </p>
          </div>
        </div>
      );
    }
    return <Navigate to="/completer-inscription" replace />;
  }

  const exempte = CHEMINS_EXEMPTES_EXPIRATION.some((c) => location.pathname.startsWith(c));

  if (entreprise && !exempte) {
    const { statut } = calculerStatutAbonnement(entreprise);
    if (!entreprise.actif || statut === "expire") {
      return <Navigate to="/abonnement-expire" replace />;
    }
  }

  // Accès "basique" (essai/starter) : redirige silencieusement vers la
  // page d'atterrissage de l'utilisateur toute tentative d'atteindre
  // une page réservée aux paliers supérieurs (via lien direct, favori,
  // etc. — la navigation ne propose déjà que les pages autorisées). Le
  // super admin garde toujours accès à /admin quel que soit le palier
  // de sa propre entreprise.
  if (
    entreprise &&
    !estSuperAdmin &&
    niveauAcces(entreprise.plan_abonnement) === "basique" &&
    !routeAutoriseeEnAccesBasique(location.pathname)
  ) {
    const destination = routeParDefaut(permissions);
    if (location.pathname !== destination) {
      return <Navigate to={destination} replace />;
    }
  }

  // Permissions résolues (rôle + surcharges individuelles définies par
  // le gérant, "aucun"/"lecture"/"ecriture" par module) : bloque
  // l'accès direct par URL à un module fermé pour cet utilisateur — la
  // navigation ne propose déjà que les modules autorisés (AppShell),
  // ceci est le filet de sécurité côté route. routeParDefaut() garantit
  // que la destination de repli est toujours elle-même autorisée (pas
  // de boucle de redirection). Le niveau "lecture" laisse passer la
  // route (chaque page masque elle-même ses actions d'écriture).
  if (!estSuperAdmin) {
    const module = moduleDeLaRoute(location.pathname);
    if (module && !peutAcceder(permissions, module)) {
      const destination = routeParDefaut(permissions);
      if (location.pathname !== destination) {
        return <Navigate to={destination} replace />;
      }
    }
  }

  return <>{children}</>;
}
