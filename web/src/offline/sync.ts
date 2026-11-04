import type { StockOperationRequest } from "../api/types";

export type QueueStatus = "pending" | "synced" | "conflict" | "failed";

export interface QueuedOperation {
  idempotencyKey: string;
  request: StockOperationRequest;
  productName: string;
  sku: string;
  queuedAt: string;
  status: QueueStatus;
  message: string | null;
  attempts: number;
}

/**
 * What a sync attempt means for a queued operation. A replayed key returns the original result,
 * so a retry after a lost response can never apply an operation twice. A changed quantity is a
 * conflict for the person to review, never a silent overwrite.
 */
export function syncOutcome(status: number, code: string | null): QueueStatus {
  if (status === 200 || status === 201) return "synced";
  if (status === 0 || status >= 500 || status === 429 || status === 401) return "pending";
  if (status === 409 && code === "QUANTITY_CHANGED") return "conflict";
  return "failed";
}

/** Normalizes a scanned code the way the server does, for matching against the offline snapshot. */
export function offlineCodeKeys(raw: string): string[] {
  const code = raw.trim();
  const keys = [code, code.toLowerCase()];
  if (/^\d{12}$/.test(code)) keys.push(`0${code}`);
  if (/^0\d{13}$/.test(code)) keys.push(code.slice(1));
  return keys;
}
