import { ExternalLink } from "lucide-react";
import type { CatalogueMatch } from "../api/types";

/** States where retrieved details came from, that they are unverified, and their licence. */
export function CatalogueSourceNote({ match }: { match: CatalogueMatch }) {
  return (
    <p className="text-xs leading-relaxed text-ink-muted">
      Details from{" "}
      <a href={match.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
        {match.sourceName}
        <ExternalLink className="size-3" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      , a community catalogue. They are not verified, so check them before saving.
      {match.licence && (
        <>
          {" "}
          Licensed under the{" "}
          <a href={match.licence.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
            {match.licence.name}
          </a>
          .
        </>
      )}
    </p>
  );
}
