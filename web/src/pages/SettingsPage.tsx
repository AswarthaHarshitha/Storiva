import { ApiError, errorMessage } from "../api/client";
import type { Settings } from "../api/types";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { QueryError } from "../components/QueryError";
import { TextField } from "../components/TextField";
import { useToast } from "../components/Toast";
import { useAdvancedMode } from "../hooks/useAdvancedMode";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useForm } from "../hooks/useForm";
import { useSaveSettings, useSettings } from "../hooks/useInventory";
import { thresholdSchema } from "../lib/validation";

export function SettingsPage() {
  useDocumentTitle("Settings");
  const settings = useSettings();

  return (
    <>
      <PageHeader title="Settings" description="Preferences for your organization." />
      {settings.isPending ? (
        <LoadingState label="Loading settings…" />
      ) : settings.isError ? (
        <QueryError error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <div className="max-w-2xl divide-y divide-line rounded-lg border border-line bg-surface">
          <section className="px-5 py-5 sm:px-6">
            <h2 className="text-sm font-semibold">Organization</h2>
            <p className="mt-1 text-sm text-ink-muted">{settings.data.organizationName}</p>
          </section>
          <ThresholdForm settings={settings.data} />
          <AdvancedToggle />
        </div>
      )}
    </>
  );
}

function ThresholdForm({ settings }: { settings: Settings }) {
  const saved = String(settings.defaultLowStockThreshold);
  const form = useForm(thresholdSchema, { defaultLowStockThreshold: saved });
  const save = useSaveSettings();
  const toast = useToast();
  const unchanged = form.values.defaultLowStockThreshold.trim() === saved;

  const submit = form.handleSubmit((values, showServerErrors) => {
    if (save.isPending) return;
    save.mutate(
      { defaultLowStockThreshold: Number(values.defaultLowStockThreshold) },
      {
        onSuccess: () => toast("Default low-stock threshold saved."),
        onError: (error) => {
          if (error instanceof ApiError && error.status === 422) showServerErrors(error.fields);
        },
      },
    );
  });

  return (
    <form onSubmit={submit} noValidate className="px-5 py-5 sm:px-6">
      <h2 className="text-sm font-semibold">Low stock</h2>
      <p className="mt-1 mb-4 max-w-prose text-sm text-ink-muted">
        A product is low on stock when its quantity is at or below its threshold. Products without a threshold of their
        own use this default. Changes apply to the dashboard and product list straight away.
      </p>
      {save.isError && !(save.error instanceof ApiError && save.error.status === 422) && (
        <div className="mb-4">
          <Alert>{errorMessage(save.error)}</Alert>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          label="Default low-stock threshold"
          name="defaultLowStockThreshold"
          inputMode="numeric"
          autoComplete="off"
          required
          className="sm:w-56"
          hint="In units. 0 flags only products that are out of stock."
          value={form.values.defaultLowStockThreshold}
          onValueChange={(v) => form.setValue("defaultLowStockThreshold", v)}
          onBlur={() => form.touch("defaultLowStockThreshold")}
          error={form.errors.defaultLowStockThreshold}
        />
        <Button type="submit" className="sm:mt-7" disabled={unchanged} loading={save.isPending} loadingLabel="Saving…">
          Save
        </Button>
      </div>
    </form>
  );
}

function AdvancedToggle() {
  const [advanced, setAdvanced] = useAdvancedMode();
  return (
    <section className="px-5 py-5 sm:px-6">
      <h2 className="text-sm font-semibold">Advanced tools</h2>
      <p className="mt-1 mb-3 max-w-prose text-sm text-ink-muted">
        Copilot, Trust Radar, exceptions, receiving, suppliers, import and export, labels, photo identification and reports. Off by
        default to keep everyday scanning simple. This setting applies to this device.
      </p>
      <label className="inline-flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" role="switch" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
        Show advanced tools
      </label>
    </section>
  );
}
