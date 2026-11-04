import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { Product, StockOperationRequest } from "../api/types";
import { kvGet, kvSet, queueAll, queueDelete, queuePut } from "./store";
import { offlineCodeKeys, syncOutcome, type QueuedOperation } from "./sync";

interface Snapshot {
  savedAt: string;
  products: Product[];
}

/** Saves the organization's products on this device so codes can be identified offline. */
export async function refreshSnapshot() {
  const products = await api.get<Product[]>("/products");
  await kvSet("snapshot", { savedAt: new Date().toISOString(), products } satisfies Snapshot);
}

export async function lookupOffline(code: string): Promise<{ product: Product | null; savedAt: string | null }> {
  const snapshot = await kvGet<Snapshot>("snapshot").catch(() => undefined);
  if (!snapshot) return { product: null, savedAt: null };
  const keys = offlineCodeKeys(code);
  const product =
    snapshot.products.find((p) => p.barcodes.some((b) => keys.includes(b.code))) ??
    snapshot.products.find((p) => keys.includes(p.sku.toLowerCase())) ??
    null;
  return { product, savedAt: snapshot.savedAt };
}

let running: Promise<void> | null = null;

/** Sends queued operations in the order they were made. Stops at the first network failure. */
async function syncQueue() {
  const items = (await queueAll<QueuedOperation & { reported?: boolean }>()).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  for (const item of items) {
    if (item.status !== "pending") continue;
    try {
      await api.post("/stock/operations", item.request);
      await queueDelete(item.idempotencyKey);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      const outcome = syncOutcome(status, error instanceof ApiError ? error.code : null);
      if (outcome === "pending") break; // still offline or server busy: try again later
      const message = error instanceof ApiError ? error.message : "Could not be applied.";
      await queuePut({ ...item, status: outcome, message, attempts: item.attempts + 1 });
      if (!item.reported) {
        await api
          .post("/exceptions/sync-failures", {
            idempotencyKey: item.idempotencyKey,
            productId: item.request.productId,
            productName: item.productName,
            operation: item.request.type,
            error: message.slice(0, 300),
            queuedAt: item.queuedAt,
          })
          .then(() => queuePut({ ...item, status: outcome, message, attempts: item.attempts + 1, reported: true }))
          .catch(() => undefined);
      }
    }
  }
}

export function useOfflineQueue() {
  const [items, setItems] = useState<QueuedOperation[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  const reload = useCallback(async () => {
    setItems((await queueAll<QueuedOperation>().catch(() => [])).sort((a, b) => b.queuedAt.localeCompare(a.queuedAt)));
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    running ??= syncQueue().finally(() => (running = null));
    await running;
    setSyncing(false);
    await reload();
    await queryClient.invalidateQueries({ queryKey: ["products"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }, [queryClient, reload]);

  const enqueue = useCallback(
    async (request: StockOperationRequest, product: Pick<Product, "name" | "sku">) => {
      await queuePut({ idempotencyKey: request.idempotencyKey, request, productName: product.name, sku: product.sku, queuedAt: new Date().toISOString(), status: "pending", message: null, attempts: 0 } satisfies QueuedOperation);
      await reload();
    },
    [reload],
  );

  const discard = useCallback(
    async (key: string) => {
      await queueDelete(key);
      await reload();
    },
    [reload],
  );

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void reload().then(() => (navigator.onLine ? sync() : undefined));
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [reload, sync]);

  return { items, online, syncing, sync, enqueue, discard };
}
