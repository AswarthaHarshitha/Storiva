import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

const base = "rounded-md p-2 text-ink-muted transition-colors focus-visible:text-ink";
const tones = {
  neutral: "hover:bg-sunken hover:text-ink",
  danger: "hover:bg-danger-soft hover:text-danger",
};

/**
 * An icon-only control with a visible tooltip on hover and keyboard focus. The accessible name
 * comes from `label`; the tooltip repeats it for sighted users, so it is hidden from screen readers.
 */
function WithTooltip({ tooltip, children }: { tooltip: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded bg-ink px-2 py-1 text-xs whitespace-nowrap text-canvas opacity-0 transition-opacity group-hover/tip:opacity-100 group-has-[:focus-visible]/tip:opacity-100"
      >
        {tooltip}
      </span>
    </span>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tooltip: string;
  tone?: keyof typeof tones;
}

export function IconButton({ label, tooltip, tone = "neutral", children, ...rest }: IconButtonProps) {
  return (
    <WithTooltip tooltip={tooltip}>
      <button type="button" aria-label={label} className={`${base} ${tones[tone]}`} {...rest}>
        {children}
      </button>
    </WithTooltip>
  );
}

export function IconLink({ to, label, tooltip, children }: { to: string; label: string; tooltip: string; children: ReactNode }) {
  return (
    <WithTooltip tooltip={tooltip}>
      <Link to={to} aria-label={label} className={`${base} ${tones.neutral}`}>
        {children}
      </Link>
    </WithTooltip>
  );
}
