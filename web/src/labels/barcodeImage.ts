import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import wasmUrl from "zxing-wasm/writer/zxing_writer.wasm?url";

// The encoder, like the scanner's decoder, is served from Storiva's own origin.
prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
});

export type LabelSymbology = "code128" | "qr";

const cache = new Map<string, Promise<string>>();

/** An SVG data URL of the code, suitable for an <img> (the CSP allows data: images). */
export function barcodeDataUrl(text: string, symbology: LabelSymbology): Promise<string> {
  const key = `${symbology}:${text}`;
  let result = cache.get(key);
  if (!result) {
    result = writeBarcode(text, { format: symbology === "qr" ? "QRCode" : "Code128", withQuietZones: true, withHRT: false }).then((r) => {
      if (r.error) throw new Error(r.error);
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.svg)}`;
    });
    cache.set(key, result);
  }
  return result;
}
