type Status = "out" | "low" | "ok";

export const stockStatus = (quantity: number, threshold: number): Status =>
  quantity === 0 ? "out" : quantity <= threshold ? "low" : "ok";

const styles: Record<Status, { label: string; className: string; dot: string }> = {
  out: { label: "Out of stock", className: "bg-danger-soft text-danger", dot: "bg-danger" },
  low: { label: "Low stock", className: "bg-warn-soft text-warn", dot: "bg-warn" },
  ok: { label: "In stock", className: "bg-ok-soft text-ok", dot: "bg-ok" },
};

export function StockStatus({ quantity, threshold }: { quantity: number; threshold: number }) {
  const style = styles[stockStatus(quantity, threshold)];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style.className}`}>
      <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
      {style.label}
    </span>
  );
}
