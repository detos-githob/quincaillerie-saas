import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./features/auth/LoginPage";
import { SignupPage } from "./features/auth/SignupPage";
import { CompleterInscriptionPage } from "./features/auth/CompleterInscriptionPage";
import { AbonnementExpirePage } from "./features/auth/AbonnementExpirePage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { VentePage } from "./features/vente/VentePage";
import { StockPage } from "./features/stock/StockPage";
import { ClientsPage } from "./features/clients/ClientsPage";
import { ClientDetailPage } from "./features/clients/ClientDetailPage";
import { FacturesPage } from "./features/factures/FacturesPage";
import { InventairePage } from "./features/inventaire/InventairePage";
import { InventaireDetailPage } from "./features/inventaire/InventaireDetailPage";
import { FournisseursPage } from "./features/fournisseurs/FournisseursPage";
import { FournisseurDetailPage } from "./features/fournisseurs/FournisseurDetailPage";
import { LivraisonsPage } from "./features/livraisons/LivraisonsPage";
import { DepotBoissonsPage } from "./features/depot-boissons/DepotBoissonsPage";
import { DepensesPage } from "./features/personnel/DepensesPage";
import { TontinesPage } from "./features/tontine/TontinesPage";
import { TontineDetailPage } from "./features/tontine/TontineDetailPage";
import { SupportPage } from "./features/support/SupportPage";
import { EquipePage } from "./features/equipe/EquipePage";
import { AdminPage } from "./features/admin/AdminPage";
import { MonAbonnementPage } from "./features/abonnement/MonAbonnementPage";
import { OffresPage } from "./features/abonnement/OffresPage";
import { PaiementPage } from "./features/abonnement/PaiementPage";
import { ParametresPage } from "./features/parametres/ParametresPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
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
            <Route path="/tontines" element={<TontinesPage />} />
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
      </BrowserRouter>
    </AuthProvider>
  );
}
