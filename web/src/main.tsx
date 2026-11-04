import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/inter-tight";
import "@fontsource/ibm-plex-mono/400.css";
import { ApiError } from "./api/client";
import { App } from "./App";
import { ToastProvider } from "./components/Toast";
import { accountKey } from "./hooks/useAccount";
import "./index.css";

// If a session expires mid-use, any request can come back 401. Clearing the account sends
// the person to the login page instead of leaving them on a screen of failed requests.
const onError = (error: unknown) => {
  if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(accountKey, null);
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => error instanceof ApiError && error.status >= 500 && failureCount < 2,
      refetchOnWindowFocus: false,
    },
  },
});

// The service worker keeps the app shell available offline (see public/sw.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is optional; the app works without it.
    });
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
