import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./features/auth/LoginPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { VentePage } from "./features/vente/VentePage";
import { StockPage } from "./features/stock/StockPage";
import { ClientsPage } from "./features/clients/ClientsPage";
import { FacturesPage } from "./features/factures/FacturesPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/factures" element={<FacturesPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
