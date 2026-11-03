import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Dashboard, LowStockItem } from "../api/types";
import { ButtonLink } from "../components/Button";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { QueryError } from "../components/QueryError";
import { StockStatus } from "../components/StockStatus";
import { useDashboard } from "../hooks/useInventory";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { formatCount, greeting, pluralize } from "../lib/format";

const addProduct = (
  <ButtonLink to="/products/new">
    <Plus className="size-4" aria-hidden />
    Add product
  </ButtonLink>
);

export function DashboardPage() {
  useDocumentTitle("Dashboard");
  const dashboard = useDashboard();
  const header = (description: string, actions?: ReactNode) => (
    <PageHeader title="Dashboard" description={description} actions={actions} />
  );

  if (dashboard.isPending) {
    return (
      <>
        {header(`${greeting()}.`)}
        <LoadingState label="Loading your inventory…" />
      </>
    );
  }
  if (dashboard.isError) {
    return (
      <>
        {header(`${greeting()}.`)}
        <QueryError error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      </>
    );
  }

  const data = dashboard.data;
  if (data.totalProducts === 0) {
    return (
      <>
        {header(`${greeting()}. Let's get your inventory set up.`)}
        <FirstRun defaultThreshold={data.defaultLowStockThreshold} />
      </>
    );
  }

  const status =
    data.lowStockCount === 0
      ? "Every product is above its low-stock threshold."
      : `${pluralize(data.lowStockCount, "product")} ${data.lowStockCount === 1 ? "is" : "are"} running low.`;

  return (
    <>
      {header(`${greeting()}. ${status}`, addProduct)}
      <Summary data={data} />
      <LowStockSection items={data.lowStockItems} defaultThreshold={data.defaultLowStockThreshold} />
    </>
  );
}

function FirstRun({ defaultThreshold }: { defaultThreshold: number }) {
  return (
    <>
      <section className="rounded-lg border border-line bg-surface px-6 py-10 sm:px-10 sm:py-12">
        <h2 className="text-lg font-semibold tracking-tight">Add your first product</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-muted">
          Enter a product's name, SKU and how many units you have on hand. Your totals will appear here, along with
          anything that is running low.
        </p>
        <div className="mt-6">
          <ButtonLink to="/products/new">
            <Plus className="size-4" aria-hidden />
            Add your first product
          </ButtonLink>
        </div>
        <p className="mt-8 border-t border-line pt-4 text-sm text-ink-muted">
          A product counts as low stock at {pluralize(defaultThreshold, "unit")} or fewer unless you give it its own
          threshold. You can change this default in{" "}
          <Link to="/settings" className="font-medium text-accent hover:underline">
            Settings
          </Link>
          .
        </p>
      </section>
    </>
  );
}

function Summary({ data }: { data: Dashboard }) {
  const cards = [
    { label: "Products", value: data.totalProducts, note: "In your inventory" },
    { label: "Units on hand", value: data.totalQuantity, note: "Across all products" },
    { label: "Low stock", value: data.lowStockCount, note: "At or below their threshold", highlight: data.lowStockCount > 0 },
  ];

  return (
    <dl className="mb-8 grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-line bg-surface px-5 py-4">
          <dt className="text-sm font-medium text-ink-muted">{card.label}</dt>
          <dd className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${card.highlight ? "text-warn" : "text-ink"}`}>
            {formatCount(card.value)}
          </dd>
          <dd className="mt-1 text-xs text-ink-faint">{card.note}</dd>
        </div>
      ))}
    </dl>
  );
}

function ThresholdCell({ item }: { item: LowStockItem }) {
  return (
    <>
      {formatCount(item.effectiveThreshold)}
      {item.lowStockThreshold === null && <span className="ml-1 text-ink-faint">(default)</span>}
    </>
  );
}

function LowStockSection({ items, defaultThreshold }: { items: LowStockItem[]; defaultThreshold: number }) {
  return (
    <section aria-labelledby="low-stock-heading">
      <div className="mb-3">
        <h2 id="low-stock-heading" className="text-base font-semibold">
          Low stock items
        </h2>
        <p className="text-sm text-ink-muted">
          Lowest quantity first. Products without their own threshold use your default of{" "}
          {pluralize(defaultThreshold, "unit")} (
          <Link to="/settings" className="font-medium text-accent hover:underline">
            change
          </Link>
          ).
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-5 py-8 text-center text-sm text-ink-muted">
          Nothing is running low. Products appear here once their quantity reaches their low-stock threshold.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">Low stock items, lowest quantity first</caption>
            <thead className="border-b border-line bg-sunken/60 text-left text-xs font-medium text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">SKU</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">On hand</th>
                <th scope="col" className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Threshold</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-canvas/70">
                  <td className="px-4 py-3">
                    <Link to={`/products/${item.id}/edit`} className="font-medium text-ink hover:text-accent hover:underline">
                      {item.name}
                    </Link>
                    <div className="mt-0.5 font-mono text-xs text-ink-muted sm:hidden">
                      {item.sku} · threshold <ThresholdCell item={item} />
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-ink-muted sm:table-cell">{item.sku}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCount(item.quantityOnHand)}</td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-ink-muted sm:table-cell">
                    <ThresholdCell item={item} />
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <StockStatus quantity={item.quantityOnHand} threshold={item.effectiveThreshold} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
