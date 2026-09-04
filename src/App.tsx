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
import { FacturesPage } from "./features/factures/FacturesPage";
import { InventairePage } from "./features/inventaire/InventairePage";
import { InventaireDetailPage } from "./features/inventaire/InventaireDetailPage";
import { EquipePage } from "./features/equipe/EquipePage";
import { AdminPage } from "./features/admin/AdminPage";

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
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/factures" element={<FacturesPage />} />
            <Route path="/equipe" element={<EquipePage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
