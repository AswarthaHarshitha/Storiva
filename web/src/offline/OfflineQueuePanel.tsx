import { CloudOff, RefreshCw } from "lucide-react";
import { Button } from "../components/Button";
import type { useOfflineQueue } from "./useOfflineQueue";

const STATUS = {
  pending: { label: "Waiting to sync", className: "bg-sunken text-ink-muted" },
  synced: { label: "Synced", className: "bg-ok-soft text-ok" },
  conflict: { label: "Needs review", className: "bg-warn-soft text-warn" },
  failed: { label: "Not applied", className: "bg-danger-soft text-danger" },
} as const;

export function OfflineQueuePanel({ queue }: { queue: ReturnType<typeof useOfflineQueue> }) {
  if (queue.items.length === 0) return null;
  return (
    <section aria-labelledby="queue-heading" className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="queue-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <CloudOff className="size-4" aria-hidden />
          Saved on this device
        </h2>
        <Button variant="secondary" onClick={() => void queue.sync()} disabled={!queue.online} loading={queue.syncing} loadingLabel="Syncing…">
          <RefreshCw className="size-4" aria-hidden />
          Sync now
        </Button>
      </div>
      <p className="mb-2 text-sm text-ink-muted">
        {queue.online ? "These are sent in the order they were made." : "You are offline. These will be sent when the connection returns."} A count is never applied over a newer quantity; it is marked for review instead.
      </p>
      <ul className="divide-y divide-line rounded-md border border-line text-sm">
        {queue.items.map((item) => (
          <li key={item.idempotencyKey} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.productName}</span>
              <span className="text-xs text-ink-muted">
                {item.request.type === "count" ? `Count ${item.request.countedQuantity}` : `${item.request.type === "receive" ? "Receive" : "Issue"} ${item.request.quantity}`} ·{" "}
                {new Date(item.queuedAt).toLocaleTimeString()}
                {item.message && ` · ${item.message}`}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS[item.status].className}`}>{STATUS[item.status].label}</span>
              {item.status !== "pending" && (
                <button type="button" onClick={() => void queue.discard(item.idempotencyKey)} className="text-xs text-ink-muted underline">
                  Dismiss
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
