import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { LoadingState } from "./components/LoadingState";
import { QueryError } from "./components/QueryError";
import { useAccount } from "./hooks/useAccount";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { EditProductPage, NewProductPage } from "./pages/ProductFormPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ScanPage } from "./pages/ScanPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignupPage } from "./pages/SignupPage";

export function App() {
  const account = useAccount();
  const location = useLocation();

  if (account.isPending) return <LoadingState label="Loading Storiva…" />;
  if (account.isError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <QueryError error={account.error} onRetry={() => void account.refetch()} />
      </div>
    );
  }

  if (!account.data) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/signup" element={<Navigate to="/" replace />} />
      <Route element={<AppLayout account={account.data} />}>
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/new" element={<NewProductPage />} />
        <Route path="products/:id/edit" element={<EditProductPage />} />
        <Route path="scan" element={<ScanPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
