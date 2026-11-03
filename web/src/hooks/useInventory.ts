import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type {
  BarcodeLookup,
  Dashboard,
  Product,
  ProductPayload,
  Settings,
  StockMovement,
  StockOperationRequest,
  StockOperationResult,
} from "../api/types";

const keys = {
  products: ["products"] as const,
  dashboard: ["dashboard"] as const,
  settings: ["settings"] as const,
};

export function useProducts(search: string) {
  return useQuery({
    queryKey: [...keys.products, "list", search],
    queryFn: () => api.get<Product[]>(search ? `/products?q=${encodeURIComponent(search)}` : "/products"),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: [...keys.products, "detail", id],
    queryFn: () => api.get<Product>(`/products/${id ?? ""}`),
    enabled: Boolean(id),
  });
}

export function useDashboard() {
  return useQuery({ queryKey: keys.dashboard, queryFn: () => api.get<Dashboard>("/dashboard") });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => api.get<Settings>("/settings") });
}

/** Any stock or threshold change can move a product in or out of the low-stock list. */
function useRefreshInventory() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.products }),
      queryClient.invalidateQueries({ queryKey: keys.dashboard }),
    ]);
}

export function useSaveProduct(id?: string) {
  const refresh = useRefreshInventory();
  return useMutation({
    mutationFn: (payload: ProductPayload) =>
      id ? api.put<Product>(`/products/${id}`, payload) : api.post<Product>("/products", payload),
    onSuccess: refresh,
  });
}

export function useAdjustStock() {
  const refresh = useRefreshInventory();
  return useMutation({
    mutationFn: ({ id, delta, note }: { id: string; delta: number; note: string | null }) =>
      api.post<Product>(`/products/${id}/adjust-stock`, { delta, note }),
    onSuccess: refresh,
  });
}

export function useDeleteProduct() {
  const refresh = useRefreshInventory();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: refresh,
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  const refresh = useRefreshInventory();
  return useMutation({
    mutationFn: (input: { defaultLowStockThreshold: number }) => api.put<Settings>("/settings", input),
    onSuccess: async (settings) => {
      queryClient.setQueryData(keys.settings, settings);
      await refresh();
    },
  });
}

export function useMovements(productId: string | undefined) {
  return useQuery({
    queryKey: [...keys.products, "movements", productId],
    queryFn: () => api.get<StockMovement[]>(`/products/${productId ?? ""}/movements?limit=10`),
    enabled: Boolean(productId),
  });
}

export const lookupBarcode = (code: string, format?: string) =>
  api.get<BarcodeLookup>(
    `/barcodes/lookup?code=${encodeURIComponent(code)}${format ? `&format=${encodeURIComponent(format)}` : ""}`,
  );

export function useStockOperation() {
  const refresh = useRefreshInventory();
  return useMutation({
    mutationFn: (request: StockOperationRequest) => api.post<StockOperationResult>("/stock/operations", request),
    onSuccess: refresh,
  });
}

export function useAttachBarcode() {
  const refresh = useRefreshInventory();
  return useMutation({
    mutationFn: ({ productId, code, format }: { productId: string; code: string; format?: string }) =>
      api.post<Product>(`/products/${productId}/barcodes`, { code, format }),
    onSuccess: refresh,
  });
}

export function useRemoveBarcode() {
  const refresh = useRefreshInventory();
  return useMutation({
    mutationFn: ({ productId, barcodeId }: { productId: string; barcodeId: string }) =>
      api.delete(`/products/${productId}/barcodes/${barcodeId}`),
    onSuccess: refresh,
  });
}
