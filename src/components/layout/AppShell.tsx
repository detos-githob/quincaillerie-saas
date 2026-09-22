import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ClipboardList,
  Users,
  FileText,
  UserCog,
  ShieldCheck,
  CreditCard,
  Wifi,
  WifiOff,
  LogOut,
  Handshake,
  Truck,
  Beer,
  Wallet,
  PiggyBank,
  LifeBuoy,
  Settings,
  MoreHorizontal,
  X,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useSyncHorsLigne } from "../../hooks/useSyncHorsLigne";
import { niveauAcces } from "../../lib/abonnement";
import { peutAcceder } from "../../lib/permissions";

export function AppShell() {
  const { entreprise, utilisateur, estSuperAdmin, permissions, deconnexion } = useAuth();
  const { enLigne, nombreEnAttente } = useSyncHorsLigne();
  const location = useLocation();
  const [menuPlusOuvert, setMenuPlusOuvert] = useState(false);

  const secteursActifs = entreprise?.secteurs_actifs?.length
    ? entreprise.secteurs_actifs
    : entreprise
      ? [entreprise.secteur_activite]
      : [];
  // Livraison est utile dès qu'il y a de la marchandise à livrer :
  // quincaillerie (gros/demi-gros) et/ou dépôt de boissons (casiers) —
  // gestion multi-activités : les deux peuvent être actifs à la fois.
  const gereLivraison = secteursActifs.includes("quincaillerie") || secteursActifs.includes("depot_boissons");
  // Essai/Starter : accès restreint aux fonctionnalités de base (voir
  // ProtectedRoute pour le blocage effectif des routes correspondantes).
  const accesComplet = entreprise ? niveauAcces(entreprise.plan_abonnement) === "complet" : true;

  const liensNav = [
    { to: "/", label: "Tableau de bord", icone: LayoutDashboard, fin: true, visible: peutAcceder(permissions, "dashboard") },
    { to: "/vente", label: "Vente", icone: ShoppingCart, visible: peutAcceder(permissions, "vente") },
    { to: "/stock", label: "Stock", icone: Package, visible: peutAcceder(permissions, "stock") },
    {
      to: "/inventaire",
      label: "Inventaire",
      icone: ClipboardList,
      visible: peutAcceder(permissions, "inventaire") && accesComplet,
    },
    {
      to: "/fournisseurs",
      label: "Fournisseurs",
      icone: Handshake,
      visible: peutAcceder(permissions, "fournisseurs") && secteursActifs.includes("quincaillerie") && accesComplet,
    },
    { to: "/livraisons", label: "Livraisons", icone: Truck, visible: peutAcceder(permissions, "livraisons") && gereLivraison && accesComplet },
    {
      to: "/depot-boissons",
      label: "Dépôt boissons",
      icone: Beer,
      visible: peutAcceder(permissions, "depot_boissons") && secteursActifs.includes("depot_boissons") && accesComplet,
    },
    { to: "/clients", label: "Clients", icone: Users, visible: peutAcceder(permissions, "clients") && accesComplet },
    { to: "/tontines", label: "Tontines", icone: PiggyBank, visible: peutAcceder(permissions, "tontines") },
    { to: "/factures", label: "Factures", icone: FileText, visible: peutAcceder(permissions, "factures") && accesComplet },
    {
      to: "/depenses",
      label: "Personnel & Dépenses",
      icone: Wallet,
      visible: peutAcceder(permissions, "depenses") && accesComplet,
    },
    { to: "/equipe", label: "Équipe", icone: UserCog, visible: peutAcceder(permissions, "equipe") },
    { to: "/parametres", label: "Paramètres", icone: Settings, visible: peutAcceder(permissions, "parametres") },
    { to: "/support", label: "Support", icone: LifeBuoy, visible: peutAcceder(permissions, "support") },
    { to: "/mon-abonnement", label: "Abonnement", icone: CreditCard, visible: peutAcceder(permissions, "abonnement") },
  ].filter((l) => l.visible);

  // Sur mobile, au-delà de 5 onglets la barre basse devient illisible :
  // on garde les 4 premiers directement visibles et on regroupe le
  // reste derrière un bouton "Plus" qui ouvre un menu complet.
  const LIMITE_ONGLETS_MOBILE = 4;
  const onglétsMobilePrincipaux = liensNav.slice(0, LIMITE_ONGLETS_MOBILE);
  const onglétsMobileSupplementaires = liensNav.slice(LIMITE_ONGLETS_MOBILE);
  const aBesoinDuBoutonPlus = onglétsMobileSupplementaires.length > 0;
  const unOngletSupplementaireEstActif = onglétsMobileSupplementaires.some((l) =>
    l.fin ? location.pathname === l.to : location.pathname.startsWith(l.to)
  );

  return (
    <div className="min-h-screen bg-stone-50 font-body flex flex-col">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Barlow Condensed', sans-serif; }
        .font-body { font-family: 'Inter', sans-serif; }
      `}</style>

      {/* Barre supérieure */}
      <header className="bg-stone-900 text-stone-50 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight leading-none truncate">
            {entreprise?.nom || "Chargement..."}
          </h1>
          <p className="text-stone-400 text-xs mt-0.5">
            {utilisateur?.nom} · {utilisateur?.role}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {estSuperAdmin && (
            <NavLink
              to="/admin"
              className="p-1.5 rounded text-stone-400 hover:text-stone-100 hover:bg-stone-800"
              title="Espace administrateur"
            >
              <ShieldCheck size={16} />
            </NavLink>
          )}
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-stone-800">
            {enLigne ? (
              <>
                <Wifi size={14} className="text-emerald-400" />
                <span className="text-stone-300 hidden sm:inline">Synchronisé</span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-amber-400" />
                <span className="text-stone-300 hidden sm:inline">
                  Hors ligne{nombreEnAttente > 0 ? ` — ${nombreEnAttente} en attente` : ""}
                </span>
              </>
            )}
          </div>
          <button
            onClick={deconnexion}
            className="p-1.5 rounded text-stone-400 hover:text-stone-100 hover:bg-stone-800"
            title="Se déconnecter"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Contenu de la page */}
      <div className="flex-1 pb-16 sm:pb-0 sm:flex">
        {/* Navigation latérale (desktop) */}
        <nav className="hidden sm:flex sm:flex-col sm:w-56 sm:border-r sm:border-stone-200 sm:py-4 sm:px-2 sm:gap-1 shrink-0">
          {liensNav.map((lien) => (
            <NavLink
              key={lien.to}
              to={lien.to}
              end={lien.fin}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium ${
                  isActive
                    ? "bg-stone-900 text-white"
                    : "text-stone-600 hover:bg-stone-100"
                }`
              }
            >
              <lien.icone size={17} />
              {lien.label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Navigation basse (mobile) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 flex justify-around py-1.5 z-30">
        {(aBesoinDuBoutonPlus ? onglétsMobilePrincipaux : liensNav).map((lien) => (
          <NavLink
            key={lien.to}
            to={lien.to}
            end={lien.fin}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium ${
                isActive ? "text-amber-600" : "text-stone-400"
              }`
            }
          >
            <lien.icone size={20} />
            {lien.label}
          </NavLink>
        ))}
        {aBesoinDuBoutonPlus && (
          <button
            onClick={() => setMenuPlusOuvert(true)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium ${
              unOngletSupplementaireEstActif ? "text-amber-600" : "text-stone-400"
            }`}
          >
            <MoreHorizontal size={20} />
            Plus
          </button>
        )}
      </nav>

      {/* Panneau "Plus" (mobile) : regroupe les onglets qui ne tiennent pas dans la barre basse */}
      {menuPlusOuvert && (
        <div className="sm:hidden fixed inset-0 z-40 flex items-end">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setMenuPlusOuvert(false)} />
          <div className="relative bg-white w-full rounded-t-2xl p-4 pb-6 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <p className="font-display text-lg font-bold text-stone-900">Tous les onglets</p>
              <button onClick={() => setMenuPlusOuvert(false)} className="text-stone-400">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {liensNav.map((lien) => (
                <NavLink
                  key={lien.to}
                  to={lien.to}
                  end={lien.fin}
                  onClick={() => setMenuPlusOuvert(false)}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1.5 py-3 rounded-xl text-[11px] font-medium text-center ${
                      isActive ? "bg-amber-50 text-amber-700" : "text-stone-600 hover:bg-stone-50"
                    }`
                  }
                >
                  <lien.icone size={20} />
                  {lien.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
