import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Package, ScanLine, Settings } from "lucide-react";
import type { Account } from "../api/types";
import { useLogout } from "../hooks/useAccount";
import { Wordmark } from "./Wordmark";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/products", label: "Products", icon: Package, end: false },
  { to: "/scan", label: "Scan", icon: ScanLine, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

export function AppLayout({ account }: { account: Account }) {
  const logout = useLogout();
  const navigate = useNavigate();

  const signOut = () => {
    logout.mutate(undefined, { onSettled: () => void navigate("/login", { replace: true }) });
  };

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-sm text-canvas focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to main content
      </a>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex lg:sticky lg:top-0 lg:h-dvh">
        <div className="border-b border-line px-5 py-4">
          <Wordmark />
          <p className="mt-4 text-xs text-ink-faint">Organization</p>
          <p className="truncate text-sm font-medium text-ink" title={account.organization.name}>
            {account.organization.name}
          </p>
        </div>
        <nav aria-label="Main" className="flex-1 space-y-0.5 p-3">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-sunken text-ink" : "text-ink-muted hover:bg-sunken/60 hover:text-ink"
                }`
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <p className="truncate px-3 pb-2 text-xs text-ink-faint" title={account.email}>
            {account.email}
          </p>
          <button
            type="button"
            onClick={signOut}
            disabled={logout.isPending}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-muted hover:bg-sunken/60 hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden />
            {logout.isPending ? "Logging out…" : "Log out"}
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="min-w-0">
          <Wordmark />
          <p className="truncate text-xs text-ink-muted">{account.organization.name}</p>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={logout.isPending}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-muted hover:bg-sunken"
        >
          <LogOut className="size-4" aria-hidden />
          Log out
        </button>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto focus:outline-none w-full max-w-6xl flex-1 px-4 pt-6 pb-24 sm:px-6 lg:px-10 lg:py-10">
        <Outlet />
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${isActive ? "text-accent" : "text-ink-muted"}`
            }
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
