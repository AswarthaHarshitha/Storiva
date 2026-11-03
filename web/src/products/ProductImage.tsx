import { useState } from "react";

/**
 * A catalogue photo, served by the catalogue's own image server. It stays hidden until it has
 * loaded, so a slow or unreachable image server never leaves an empty frame or a broken image.
 */
export function ProductImage({ url, alt, className = "size-16" }: { url: string; alt: string; className?: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  if (state === "failed") return null;
  return (
    <img
      src={url}
      alt={alt}
      hidden={state !== "loaded"}
      referrerPolicy="no-referrer"
      onLoad={() => setState("loaded")}
      onError={() => setState("failed")}
      className={`${className} shrink-0 rounded-md border border-line bg-white object-contain`}
    />
  );
}
