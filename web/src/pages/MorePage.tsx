import { Link } from "react-router-dom";
import { ChevronRight, Settings } from "lucide-react";
import { advancedNavItems } from "../components/advancedNav";
import { PageHeader } from "../components/PageHeader";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

/** On phones, the advanced tools and settings live behind the "More" tab. */
export function MorePage() {
  useDocumentTitle("More");
  return (
    <>
      <PageHeader title="More" description="Advanced tools and settings." />
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {[...advancedNavItems, { to: "/settings", label: "Settings", icon: Settings, description: "Default low-stock threshold and advanced tools." }].map(
          ({ to, label, icon: Icon, description }) => (
            <li key={to}>
              <Link to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken/60">
                <Icon className="size-5 shrink-0 text-ink-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-sm text-ink-muted">{description}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-faint" aria-hidden />
              </Link>
            </li>
          ),
        )}
      </ul>
    </>
  );
}
