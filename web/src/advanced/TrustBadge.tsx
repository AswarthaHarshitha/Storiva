import type { TrustLevel } from "../api/advanced";

const styles: Record<TrustLevel, { label: string; className: string }> = {
  high: { label: "Reliable", className: "bg-ok-soft text-ok" },
  medium: { label: "Check soon", className: "bg-warn-soft text-warn" },
  low: { label: "Doubtful", className: "bg-danger-soft text-danger" },
  unverified: { label: "Never counted", className: "bg-sunken text-ink-muted" },
};

export const trustLabel = (level: TrustLevel) => styles[level].label;

export function TrustBadge({ level }: { level: TrustLevel }) {
  return <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${styles[level].className}`}>{styles[level].label}</span>;
}
