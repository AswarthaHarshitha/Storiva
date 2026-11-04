import { lazy, Suspense } from "react";
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
import { MorePage } from "./pages/MorePage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignupPage } from "./pages/SignupPage";

// Advanced tools are loaded only when opened, so everyday scanning stays light.
const ScanPage = lazy(() => import("./pages/ScanPage").then((m) => ({ default: m.ScanPage })));
const BulkPage = lazy(() => import("./pages/BulkPage").then((m) => ({ default: m.BulkPage })));
const CopilotPage = lazy(() => import("./pages/CopilotPage").then((m) => ({ default: m.CopilotPage })));
const ExceptionsPage = lazy(() => import("./pages/ExceptionsPage").then((m) => ({ default: m.ExceptionsPage })));
const IdentifyPage = lazy(() => import("./pages/IdentifyPage").then((m) => ({ default: m.IdentifyPage })));
const LabelsPage = lazy(() => import("./pages/LabelsPage").then((m) => ({ default: m.LabelsPage })));
const ReceiptPage = lazy(() => import("./pages/ReceiptPage").then((m) => ({ default: m.ReceiptPage })));
const ReceivingPage = lazy(() => import("./pages/ReceivingPage").then((m) => ({ default: m.ReceivingPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const SuppliersPage = lazy(() => import("./pages/SuppliersPage").then((m) => ({ default: m.SuppliersPage })));
const TrustRadarPage = lazy(() => import("./pages/TrustRadarPage").then((m) => ({ default: m.TrustRadarPage })));

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
        <Route path="scan" element={<Suspense fallback={<LoadingState label="Loading…" />}><ScanPage /></Suspense>} />
        <Route path="more" element={<MorePage />} />
        <Route path="copilot" element={<Suspense fallback={<LoadingState label="Loading…" />}><CopilotPage /></Suspense>} />
        <Route path="trust" element={<Suspense fallback={<LoadingState label="Loading…" />}><TrustRadarPage /></Suspense>} />
        <Route path="exceptions" element={<Suspense fallback={<LoadingState label="Loading…" />}><ExceptionsPage /></Suspense>} />
        <Route path="receiving" element={<Suspense fallback={<LoadingState label="Loading…" />}><ReceivingPage /></Suspense>} />
        <Route path="receiving/new" element={<Suspense fallback={<LoadingState label="Loading…" />}><ReceiptPage /></Suspense>} />
        <Route path="receiving/:id" element={<Suspense fallback={<LoadingState label="Loading…" />}><ReceiptPage /></Suspense>} />
        <Route path="suppliers" element={<Suspense fallback={<LoadingState label="Loading…" />}><SuppliersPage /></Suspense>} />
        <Route path="bulk" element={<Suspense fallback={<LoadingState label="Loading…" />}><BulkPage /></Suspense>} />
        <Route path="labels" element={<Suspense fallback={<LoadingState label="Loading…" />}><LabelsPage /></Suspense>} />
        <Route path="identify" element={<Suspense fallback={<LoadingState label="Loading…" />}><IdentifyPage /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<LoadingState label="Loading…" />}><ReportsPage /></Suspense>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
