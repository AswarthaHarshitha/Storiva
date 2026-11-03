import type { ReactNode } from "react";
import { Wordmark } from "./Wordmark";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center sm:py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark className="text-lg" />
          <p className="mt-2 text-sm text-ink-muted">A simpler way to stay in control of your inventory.</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(38_34_30/0.04)] sm:p-7">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-ink-muted">{subtitle}</p>
          {children}
        </div>
        <p className="mt-6 text-center text-sm text-ink-muted">{footer}</p>
      </div>
    </div>
  );
}
