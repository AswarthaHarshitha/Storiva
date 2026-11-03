import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex gap-2.5 rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger">
      <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
