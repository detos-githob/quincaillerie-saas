import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ClipboardList,
  Users,
  FileText,
  Wifi,
  WifiOff,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useSyncHorsLigne } from "../../hooks/useSyncHorsLigne";

const LIENS_NAV = [
  { to: "/", label: "Tableau de bord", icone: LayoutDashboard, fin: true },
  { to: "/vente", label: "Vente", icone: ShoppingCart },
  { to: "/stock", label: "Stock", icone: Package },
  { to: "/inventaire", label: "Inventaire", icone: ClipboardList },
  { to: "/clients", label: "Clients", icone: Users },
  { to: "/factures", label: "Factures", icone: FileText },
];

export function AppShell() {
  const { entreprise, utilisateur, deconnexion } = useAuth();
  const { enLigne, nombreEnAttente } = useSyncHorsLigne();

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
          {LIENS_NAV.map((lien) => (
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
        {LIENS_NAV.map((lien) => (
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
      </nav>
    </div>
  );
}
