import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import type { CopilotReply } from "../api/advanced";
import { api, errorMessage } from "../api/client";
import type { Product, StockOperationResult } from "../api/types";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { useCopilot, useRefreshAll } from "../hooks/useAdvanced";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

interface Turn {
  id: number;
  question: string;
  reply?: CopilotReply;
  error?: string;
  outcome?: { status: "applied"; text: string } | { status: "failed"; text: string } | { status: "cancelled" };
}

const SUGGESTIONS = [
  "Which products are running low?",
  "Which products have not been physically verified?",
  "Which products have the highest inventory value?",
  "Which products have unusual stock adjustments?",
  "Which products need replenishment?",
];

export function CopilotPage() {
  useDocumentTitle("Copilot");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const copilot = useCopilot();
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [turns]);

  const ask = (question: string, productId?: string, replaceId?: number) => {
    if (!question.trim() || copilot.isPending) return;
    const id = replaceId ?? nextId.current++;
    if (!replaceId) setTurns((t) => [...t, { id, question }]);
    copilot.mutate(
      { message: question, productId },
      {
        onSuccess: (reply) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, reply, error: undefined } : x))),
        onError: (error) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: errorMessage(error) } : x))),
      },
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(message);
    setMessage("");
  };

  return (
    <>
      <PageHeader
        title="Copilot"
        description="Ask about your inventory in plain words. Answers come from your recorded data; stock changes are shown for confirmation before anything is saved."
      />
      <div className="mx-auto max-w-3xl space-y-4">
        {turns.length === 0 && (
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="mb-2 text-sm font-medium">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {[...SUGGESTIONS, "Increase … by 10"].map((s) => (
                <button key={s} type="button" onClick={() => (s.includes("…") ? setMessage("Increase ") : ask(s))} className="rounded-full border border-line-strong px-3 py-1 text-sm hover:bg-sunken">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <ol className="space-y-4" aria-live="polite">
          {turns.map((turn) => (
            <li key={turn.id} className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-ink px-3 py-2 text-sm text-canvas">{turn.question}</p>
              {turn.error ? (
                <Alert>{turn.error}</Alert>
              ) : !turn.reply ? (
                <p className="text-sm text-ink-muted">Looking…</p>
              ) : (
                <ReplyView turn={turn} onPick={(productId) => ask(turn.question, productId, turn.id)} onOutcome={(outcome) => setTurns((t) => t.map((x) => (x.id === turn.id ? { ...x, outcome } : x)))} />
              )}
            </li>
          ))}
        </ol>
        <div ref={endRef} />
        <form onSubmit={submit} className="sticky bottom-20 flex gap-2 rounded-lg border border-line bg-surface p-2 shadow-sm lg:bottom-4">
          <label htmlFor="copilot-message" className="sr-only">
            Ask Copilot
          </label>
          <input
            id="copilot-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={300}
            autoComplete="off"
            placeholder="e.g. Which products are running low?"
            className="min-w-0 flex-1 rounded-md border border-field bg-surface px-3 py-2 text-sm focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0"
          />
          <Button type="submit" disabled={!message.trim()} loading={copilot.isPending} loadingLabel="Asking…">
            <Send className="size-4" aria-hidden />
            Ask
          </Button>
        </form>
      </div>
    </>
  );
}

function ReplyView({ turn, onPick, onOutcome }: { turn: Turn; onPick: (productId: string) => void; onOutcome: (o: NonNullable<Turn["outcome"]>) => void }) {
  const reply = turn.reply as CopilotReply;
  const refresh = useRefreshAll();
  const [busy, setBusy] = useState(false);
  // One key per proposal: a retried confirmation cannot apply the change twice.
  const [key] = useState(() => crypto.randomUUID());

  const confirm = async () => {
    const p = reply.proposal;
    if (!p || busy) return;
    setBusy(true);
    try {
      await api.post<StockOperationResult>("/stock/operations", {
        productId: p.productId,
        type: "adjust",
        delta: p.delta,
        expectedQuantity: p.expectedQuantity,
        source: "copilot",
        note: `Copilot: ${turn.question}`.slice(0, 200),
        idempotencyKey: key,
      });
      // Read the product back so the confirmation shows what is actually stored.
      const saved = await api.get<Product>(`/products/${p.productId}`);
      void refresh();
      onOutcome({ status: "applied", text: `Saved. ${saved.name} now has ${saved.quantityOnHand} units (checked against the database).` });
    } catch (error) {
      onOutcome({ status: "failed", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[95%] space-y-2 rounded-lg border border-line bg-surface p-3 text-sm">
      <p>{reply.text}</p>
      {reply.items && reply.items.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {reply.items.map((item, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
              {item.id ? (
                <Link to={`/products/${item.id}/edit`} className="font-medium hover:text-accent hover:underline">
                  {item.name}
                </Link>
              ) : (
                <span className="font-medium">{item.name}</span>
              )}
              <span className="text-ink-muted">{item.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {reply.candidates && reply.candidates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {reply.candidates.map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c.id)} className="rounded-md border border-line-strong px-3 py-1.5 text-left hover:bg-sunken">
              <span className="block font-medium">{c.name}</span>
              <span className="font-mono text-xs text-ink-muted">
                {c.sku} · {c.quantity} on hand
              </span>
            </button>
          ))}
        </div>
      )}
      {reply.proposal && (
        <div className="rounded-md border border-accent/40 bg-accent-soft/40 p-3">
          <p className="font-medium">{reply.proposal.name}</p>
          <dl className="mt-2 grid grid-cols-3 text-center">
            <div><dt className="text-xs text-ink-muted">Now</dt><dd className="font-medium tabular-nums">{reply.proposal.expectedQuantity}</dd></div>
            <div><dt className="text-xs text-ink-muted">Change</dt><dd className="font-medium tabular-nums">{reply.proposal.delta > 0 ? "+" : "−"}{Math.abs(reply.proposal.delta)}</dd></div>
            <div><dt className="text-xs text-ink-muted">After</dt><dd className="font-semibold tabular-nums">{reply.proposal.resultingQuantity}</dd></div>
          </dl>
          {!turn.outcome ? (
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => onOutcome({ status: "cancelled" })} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => void confirm()} loading={busy} loadingLabel="Saving…">
                Confirm change
              </Button>
            </div>
          ) : (
            <p role="status" className={`mt-3 ${turn.outcome.status === "applied" ? "text-ok" : turn.outcome.status === "failed" ? "text-danger" : "text-ink-muted"}`}>
              {turn.outcome.status === "cancelled" ? "Cancelled. Nothing was changed." : turn.outcome.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
