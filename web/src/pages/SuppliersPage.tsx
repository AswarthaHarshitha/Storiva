import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type { Reliability, Supplier } from "../api/advanced";
import { ApiError, errorMessage } from "../api/client";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { QueryError } from "../components/QueryError";
import { TextField } from "../components/TextField";
import { useToast } from "../components/Toast";
import { useDeleteSupplier, useSaveSupplier, useSuppliers } from "../hooks/useAdvanced";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

function ReliabilitySummary({ r }: { r: Reliability | null }) {
  if (!r) return <p className="text-sm text-ink-muted">No confirmed receipts yet, so there is no delivery record to judge.</p>;
  const facts = [
    r.fillRate !== null ? `${r.fillRate}% of expected units delivered (${r.linesWithExpectedQuantity} lines with an expected quantity)` : "No lines with an expected quantity",
    `${r.shortLines} short ${r.shortLines === 1 ? "line" : "lines"}`,
    r.damagedRate !== null ? `${r.damagedRate}% of received units damaged` : null,
    r.deliveriesWithDueDate > 0 ? `${r.lateDeliveries} of ${r.deliveriesWithDueDate} deliveries with a due date were late` : "No due dates recorded",
  ].filter(Boolean);
  return (
    <p className="text-sm text-ink-muted">
      Based on {r.receipts} confirmed {r.receipts === 1 ? "receipt" : "receipts"}: {facts.join(" · ")}.
    </p>
  );
}

export function SuppliersPage() {
  useDocumentTitle("Suppliers");
  const suppliers = useSuppliers();
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const remove = useDeleteSupplier();
  const toast = useToast();

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Reliability comes only from receipts you confirmed: what was expected, what arrived, and when."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden />
            Add supplier
          </Button>
        }
      />
      {suppliers.isPending ? (
        <LoadingState label="Loading suppliers…" />
      ) : suppliers.isError ? (
        <QueryError error={suppliers.error} onRetry={() => void suppliers.refetch()} />
      ) : suppliers.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-5 py-10 text-center text-sm text-ink-muted">No suppliers yet.</p>
      ) : (
        <ul className="space-y-3">
          {suppliers.data.map((s) => (
            <li key={s.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{s.name}</h2>
                  <p className="text-sm text-ink-muted">{[s.email, s.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={() => setEditing(s)}>Edit</Button>
                  <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setDeleting(s)}>Delete</Button>
                </div>
              </div>
              <div className="mt-2"><ReliabilitySummary r={s.reliability} /></div>
              {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
            </li>
          ))}
        </ul>
      )}
      <SupplierDialog supplier={editing} onClose={() => setEditing(null)} />
      <Dialog open={deleting !== null} onClose={() => setDeleting(null)} title="Delete this supplier?">
        {deleting && (
          <div className="mt-2 space-y-4 text-sm">
            <p className="text-ink-muted">{deleting.name} will be removed. Its receipts are kept, without a supplier.</p>
            {remove.isError && <Alert>{errorMessage(remove.error)}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)} autoFocus>Keep supplier</Button>
              <Button variant="danger" loading={remove.isPending} loadingLabel="Deleting…" onClick={() => remove.mutate(deleting.id, { onSuccess: () => { toast("Supplier deleted."); setDeleting(null); } })}>
                Delete supplier
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

function SupplierDialog({ supplier, onClose }: { supplier: Supplier | "new" | null; onClose: () => void }) {
  const existing = supplier && supplier !== "new" ? supplier : null;
  return (
    <Dialog open={supplier !== null} onClose={onClose} title={existing ? "Edit supplier" : "Add supplier"}>
      {supplier && <SupplierForm key={existing?.id ?? "new"} existing={existing} onDone={onClose} />}
    </Dialog>
  );
}

function SupplierForm({ existing, onDone }: { existing: Supplier | null; onDone: () => void }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const save = useSaveSupplier();
  const toast = useToast();
  const fields = save.error instanceof ApiError ? save.error.fields : {};

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (save.isPending) return;
    save.mutate(
      { id: existing?.id, name, email: email.trim() || null, phone: phone.trim() || null, notes: notes.trim() || null },
      { onSuccess: () => { toast(existing ? "Supplier saved." : "Supplier added."); onDone(); } },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="mt-2 space-y-3">
      <TextField label="Name" name="name" required value={name} onValueChange={setName} error={fields.name} autoFocus />
      <TextField label="Email" name="email" type="email" value={email} onValueChange={setEmail} error={fields.email} />
      <TextField label="Phone" name="phone" value={phone} onValueChange={setPhone} error={fields.phone} />
      <TextField label="Notes" name="notes" multiline value={notes} onValueChange={setNotes} error={fields.notes} />
      {save.isError && Object.keys(fields).length === 0 && <Alert>{errorMessage(save.error)}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={!name.trim()} loading={save.isPending} loadingLabel="Saving…">Save</Button>
      </div>
    </form>
  );
}
