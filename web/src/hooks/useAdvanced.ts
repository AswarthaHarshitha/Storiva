import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CopilotReply,
  ExceptionList,
  ImportRowPlan,
  ImportSummary,
  ParsedInvoice,
  ProductEvidence,
  ProductTrust,
  Receipt,
  ReceiptPayload,
  ReceiptSummary,
  Reports,
  Simulation,
  Supplier,
  TextMatch,
  TrustOverview,
} from "../api/advanced";
import { api } from "../api/client";

/** Anything that changes stock or product data can change these views. */
function useRefreshAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [["products"], ["dashboard"], ["trust"], ["exceptions"], ["evidence"], ["receipts"], ["suppliers"], ["reports"]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export const useEvidence = (productId: string) =>
  useQuery({ queryKey: ["evidence", productId], queryFn: () => api.get<ProductEvidence>(`/products/${productId}/evidence`) });

export function useVerifyField(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (field: string) => api.post<ProductEvidence>(`/products/${productId}/evidence/verify`, { field }),
    onSuccess: (data) => queryClient.setQueryData(["evidence", productId], data),
  });
}

export const useTrust = () => useQuery({ queryKey: ["trust"], queryFn: () => api.get<TrustOverview>("/trust") });
export const useProductTrust = (productId: string) =>
  useQuery({ queryKey: ["trust", productId], queryFn: () => api.get<ProductTrust>(`/products/${productId}/trust`) });

export const useExceptions = (status: "open" | "closed") =>
  useQuery({ queryKey: ["exceptions", status], queryFn: () => api.get<ExceptionList>(`/exceptions?status=${status}`) });

export function useResolveException() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: "resolved" | "dismissed"; note: string }) =>
      api.post<undefined>(`/exceptions/${id}/resolve`, { status, note }),
    onSuccess: refresh,
  });
}

export const useReports = (days: number) => useQuery({ queryKey: ["reports", days], queryFn: () => api.get<Reports>(`/reports?days=${days}`) });

export const useSimulation = () =>
  useMutation({
    mutationFn: (input: { productId: string; extraUnits: number; demandChangePercent: number; delayDays: number; newPrice: string | null }) =>
      api.post<Simulation>("/simulate", input),
  });

export const useSuppliers = () => useQuery({ queryKey: ["suppliers"], queryFn: () => api.get<Supplier[]>("/suppliers") });

export function useSaveSupplier() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, ...input }: { id?: string; name: string; email: string | null; phone: string | null; notes: string | null }) =>
      id ? api.put<Supplier>(`/suppliers/${id}`, input) : api.post<Supplier>("/suppliers", input),
    onSuccess: refresh,
  });
}

export function useDeleteSupplier() {
  const refresh = useRefreshAll();
  return useMutation({ mutationFn: (id: string) => api.delete(`/suppliers/${id}`), onSuccess: refresh });
}

export const useReceipts = () => useQuery({ queryKey: ["receipts"], queryFn: () => api.get<ReceiptSummary[]>("/receipts") });
export const useReceipt = (id: string | undefined) =>
  useQuery({ queryKey: ["receipts", id], queryFn: () => api.get<Receipt>(`/receipts/${id ?? ""}`), enabled: Boolean(id) });

export function useSaveReceipt(id?: string) {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (payload: ReceiptPayload) => (id ? api.put<Receipt>(`/receipts/${id}`, payload) : api.post<Receipt>("/receipts", payload)),
    onSuccess: refresh,
  });
}

export function useConfirmReceipt() {
  const refresh = useRefreshAll();
  return useMutation({ mutationFn: (id: string) => api.post<Receipt>(`/receipts/${id}/confirm`), onSuccess: refresh });
}

export function useDeleteReceipt() {
  const refresh = useRefreshAll();
  return useMutation({ mutationFn: (id: string) => api.delete(`/receipts/${id}`), onSuccess: refresh });
}

export const useParseInvoice = () => useMutation({ mutationFn: (text: string) => api.post<ParsedInvoice>("/receipts/parse", { text }) });

export const useImportPreview = () =>
  useMutation({
    mutationFn: (rows: Record<string, string>[]) => api.post<{ rows: ImportRowPlan[]; summary: ImportSummary }>("/imports/preview", { rows }),
  });

export function useImportCommit() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (input: { fileName: string; rows: Record<string, string>[] }) =>
      api.post<{ importId: string; summary: ImportSummary; errors: ImportRowPlan[] }>("/imports", input),
    onSuccess: refresh,
  });
}

export const useCopilot = () =>
  useMutation({ mutationFn: (input: { message: string; productId?: string }) => api.post<CopilotReply>("/copilot", input) });

export const useRecognize = () => useMutation({ mutationFn: (text: string) => api.post<{ matches: TextMatch[] }>("/recognize", { text }) });

export { useRefreshAll };
