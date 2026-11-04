import { useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { Camera } from "lucide-react";
import type { TextMatch } from "../api/advanced";
import type { CatalogueLookup } from "../api/types";
import { api, errorMessage } from "../api/client";
import { Alert } from "../components/Alert";
import { PageHeader } from "../components/PageHeader";
import { useRecognize } from "../hooks/useAdvanced";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { checkImageFile, readText } from "../ocr/ocr";
import { decodeImage } from "../scanner/decoder";

type Outcome =
  | { kind: "barcode"; code: string; lookup: CatalogueLookup }
  | { kind: "text"; text: string; matches: TextMatch[] }
  | { kind: "nothing"; text: string };

async function imageData(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

const CONFIDENCE: Record<TextMatch["confidence"], string> = {
  exact: "Exact: SKU or barcode found in the photo",
  high: "Likely",
  medium: "Possible",
  low: "Weak",
};

export function IdentifyPage() {
  useDocumentTitle("Identify by photo");
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const recognize = useRecognize();

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const invalid = checkImageFile(file);
    if (invalid) return setError(invalid);
    setError(null);
    setOutcome(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setState("working");
    try {
      setStep("Looking for a barcode…");
      const [code] = await decodeImage(await imageData(file));
      if (code) {
        const lookup = await api.get<CatalogueLookup>(`/catalogue/lookup?code=${encodeURIComponent(code.text)}&format=${encodeURIComponent(code.format)}`);
        setOutcome({ kind: "barcode", code: code.text, lookup });
      } else {
        setStep("No barcode found. Reading the printed words…");
        const { text } = await readText(file);
        const words = text.replace(/\s+/g, " ").trim();
        if (words.length < 2) setOutcome({ kind: "nothing", text: words });
        else {
          const { matches } = await recognize.mutateAsync(words.slice(0, 5000));
          setOutcome(matches.length ? { kind: "text", text: words, matches } : { kind: "nothing", text: words });
        }
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setState("done");
    }
  };

  return (
    <>
      <PageHeader
        title="Identify by photo"
        description="Take a photo of a product or its packaging. Storiva looks for a barcode first, then compares the printed words with your products. Suggestions are not certain; nothing is saved."
      />
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-3">
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover">
            <Camera className="size-4" aria-hidden />
            Take or choose a photo
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => void onFile(e)} className="sr-only" />
          </label>
          <p className="text-sm text-ink-muted">The photo is processed on this device and is not uploaded.</p>
          {preview && <img src={preview} alt="The photo being identified" className="w-full rounded-lg border border-line" />}
        </div>
        <section aria-live="polite" aria-label="Identification result" className="rounded-lg border border-line bg-surface p-4">
          {state === "working" && <p role="status" className="text-sm text-ink-muted">{step}</p>}
          {error && <Alert>{error}</Alert>}
          {state === "idle" && <p className="text-sm text-ink-muted">The result appears here.</p>}
          {outcome?.kind === "barcode" && (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-ok">Barcode found: <span className="font-mono">{outcome.code}</span> (a confirmed identification)</p>
              {outcome.lookup.existing ? (
                <p>
                  It belongs to{" "}
                  <Link to={`/products/${outcome.lookup.existing.id}/edit`} className="font-medium text-accent hover:underline">
                    {outcome.lookup.existing.name}
                  </Link>{" "}
                  in your inventory.
                </p>
              ) : outcome.lookup.matches[0] ? (
                <p>
                  Not in your inventory. {outcome.lookup.matches[0].sourceName} lists it as “{outcome.lookup.matches[0].name ?? "unnamed"}” (unverified community data).{" "}
                  <Link to={`/scan?mode=add`} className="font-medium text-accent hover:underline">Add it from the scanner</Link>
                </p>
              ) : (
                <p>Not in your inventory, and no catalogue has details for it. <Link to={`/products/new?barcode=${encodeURIComponent(outcome.code)}`} className="font-medium text-accent hover:underline">Create a product with this barcode</Link></p>
              )}
            </div>
          )}
          {outcome?.kind === "text" && (
            <div className="space-y-3 text-sm">
              <p>No barcode was visible. These products match words read from the photo — check before relying on them:</p>
              <ul className="divide-y divide-line rounded-md border border-line">
                {outcome.matches.map((m) => (
                  <li key={m.productId} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                    <Link to={`/products/${m.productId}/edit`} className="font-medium hover:text-accent hover:underline">{m.name}</Link>
                    <span className="text-ink-muted">{CONFIDENCE[m.confidence]} · {m.reason}</span>
                  </li>
                ))}
              </ul>
              <details><summary className="cursor-pointer text-ink-muted">Words read from the photo</summary><p className="mt-1 text-ink-muted">{outcome.text}</p></details>
            </div>
          )}
          {outcome?.kind === "nothing" && (
            <p className="text-sm text-ink-muted">
              Nothing in the photo matched your products{outcome.text ? "" : ", and no words could be read"}. Try a closer photo of the label, or{" "}
              <Link to="/scan" className="text-accent hover:underline">scan its barcode</Link>.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
