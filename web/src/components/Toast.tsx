import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CircleCheck } from "lucide-react";

const ToastContext = createContext<(message: string) => void>(() => undefined);

/** A single polite notice confirming that something the person did has been saved. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const show = useCallback((message: string) => setToast({ id: Date.now(), message }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 lg:bottom-6">
        {toast && (
          <div key={toast.id} className="flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm text-canvas shadow-lg">
            <CircleCheck className="size-4 text-[#9fc28a]" aria-hidden />
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
