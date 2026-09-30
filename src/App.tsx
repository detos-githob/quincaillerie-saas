import { lazy, Suspense, type ComponentType } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { AppShell } from "./components/layout/AppShell";

/**
 * Chargement à la demande : chaque page n'est téléchargée que lorsqu'on
 * l'ouvre. La page d'accueil publique s'affiche ainsi vite, même en 3G.
 * Hors connexion, toutes les pages restent disponibles : le service
 * worker les garde toutes sur l'appareil.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function page<M extends Record<string, any>>(charger: () => Promise<M>, nom: keyof M) {
  return lazy(() => charger().then((m) => ({ default: m[nom] as ComponentType })));
}

const LoginPage = page(() => import("./features/auth/LoginPage"), "LoginPage");
const SignupPage = page(() => import("./features/auth/SignupPage"), "SignupPage");
const CompleterInscriptionPage = page(() => import("./features/auth/CompleterInscriptionPage"), "CompleterInscriptionPage");
const AbonnementExpirePage = page(() => import("./features/auth/AbonnementExpirePage"), "AbonnementExpirePage");
const MotDePasseOubliePage = page(() => import("./features/auth/MotDePasseOubliePage"), "MotDePasseOubliePage");
const ReinitialiserMotDePassePage = page(() => import("./features/auth/ReinitialiserMotDePassePage"), "ReinitialiserMotDePassePage");
const ConditionsGeneralesPage = page(() => import("./features/legal/ConditionsGeneralesPage"), "ConditionsGeneralesPage");
const InstallerPage = page(() => import("./features/installation/InstallerPage"), "InstallerPage");
const ConditionsTontinePage = page(() => import("./features/tontine/ConditionsTontinePage"), "ConditionsTontinePage");
const DashboardPage = page(() => import("./features/dashboard/DashboardPage"), "DashboardPage");
const VentePage = page(() => import("./features/vente/VentePage"), "VentePage");
const StockPage = page(() => import("./features/stock/StockPage"), "StockPage");
const ClientsPage = page(() => import("./features/clients/ClientsPage"), "ClientsPage");
const ClientDetailPage = page(() => import("./features/clients/ClientDetailPage"), "ClientDetailPage");
const FacturesPage = page(() => import("./features/factures/FacturesPage"), "FacturesPage");
const InventairePage = page(() => import("./features/inventaire/InventairePage"), "InventairePage");
const InventaireDetailPage = page(() => import("./features/inventaire/InventaireDetailPage"), "InventaireDetailPage");
const FournisseursPage = page(() => import("./features/fournisseurs/FournisseursPage"), "FournisseursPage");
const FournisseurDetailPage = page(() => import("./features/fournisseurs/FournisseurDetailPage"), "FournisseurDetailPage");
const LivraisonsPage = page(() => import("./features/livraisons/LivraisonsPage"), "LivraisonsPage");
const DepotBoissonsPage = page(() => import("./features/depot-boissons/DepotBoissonsPage"), "DepotBoissonsPage");
const DepensesPage = page(() => import("./features/personnel/DepensesPage"), "DepensesPage");
const TontinesPage = page(() => import("./features/tontine/TontinesPage"), "TontinesPage");
const TontineDetailPage = page(() => import("./features/tontine/TontineDetailPage"), "TontineDetailPage");
const SupportPage = page(() => import("./features/support/SupportPage"), "SupportPage");
const EquipePage = page(() => import("./features/equipe/EquipePage"), "EquipePage");
const AdminPage = page(() => import("./features/admin/AdminPage"), "AdminPage");
const MonAbonnementPage = page(() => import("./features/abonnement/MonAbonnementPage"), "MonAbonnementPage");
const OffresPage = page(() => import("./features/abonnement/OffresPage"), "OffresPage");
const PaiementPage = page(() => import("./features/abonnement/PaiementPage"), "PaiementPage");
const ParametresPage = page(() => import("./features/parametres/ParametresPage"), "ParametresPage");
const CloturesPage = page(() => import("./features/clotures/CloturesPage"), "CloturesPage");
const LandingPage = page(() => import("./features/landing/LandingPage"), "LandingPage");

function ChargementPage() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center text-stone-400 text-sm" role="status">
      Chargement...
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<ChargementPage />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/mot-de-passe-oublie" element={<MotDePasseOubliePage />} />
          <Route path="/reinitialiser-mot-de-passe" element={<ReinitialiserMotDePassePage />} />
          <Route path="/conditions-generales" element={<ConditionsGeneralesPage />} />
          <Route path="/installer" element={<InstallerPage />} />
          <Route path="/decouvrir" element={<LandingPage />} />
          <Route path="/completer-inscription" element={<CompleterInscriptionPage />} />
          <Route path="/abonnement-expire" element={<AbonnementExpirePage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/vente" element={<VentePage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/inventaire" element={<InventairePage />} />
            <Route path="/inventaire/:id" element={<InventaireDetailPage />} />
            <Route path="/fournisseurs" element={<FournisseursPage />} />
            <Route path="/fournisseurs/:id" element={<FournisseurDetailPage />} />
            <Route path="/livraisons" element={<LivraisonsPage />} />
            <Route path="/depot-boissons" element={<DepotBoissonsPage />} />
            <Route path="/depenses" element={<DepensesPage />} />
            <Route path="/clotures" element={<CloturesPage />} />
            <Route path="/tontines" element={<TontinesPage />} />
            <Route path="/tontines/conditions" element={<ConditionsTontinePage />} />
            <Route path="/tontines/:id" element={<TontineDetailPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:id" element={<ClientDetailPage />} />
            <Route path="/factures" element={<FacturesPage />} />
            <Route path="/equipe" element={<EquipePage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/parametres" element={<ParametresPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/mon-abonnement" element={<MonAbonnementPage />} />
            <Route path="/offres" element={<OffresPage />} />
            <Route path="/paiement" element={<PaiementPage />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
