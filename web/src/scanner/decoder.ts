import { prepareZXingModule, readBarcodes, type ReadInputBarcodeFormat } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

// Serve the decoder from Storiva's own origin instead of the library's default CDN.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
  },
});

export const SCAN_FORMATS: ReadInputBarcodeFormat[] = [
  "EAN-13",
  "EAN-8",
  "UPC-A",
  "UPC-E",
  "ITF14",
  "ITF",
  "Code128",
  "Code39",
  "Code93",
  "Codabar",
  "QRCode",
  "DataMatrix",
];

export interface DecodedBarcode {
  text: string;
  format: string;
}

/** ZXing (WebAssembly). Works in every browser, but needs a sharp image of the bars. */
export async function decodeWithZxing(image: ImageData): Promise<DecodedBarcode[]> {
  const results = await readBarcodes(image, { formats: SCAN_FORMATS, tryHarder: true, maxNumberOfSymbols: 1 });
  return results.filter((r) => r.isValid && r.text).map((r) => ({ text: r.text, format: r.format }));
}

/*
 * The browser's built-in BarcodeDetector (Chrome and Edge on Android, macOS and ChromeOS) uses
 * the operating system's barcode engine. In testing it read about twice as many slightly blurred
 * or small camera frames as ZXing, which is what a webcam or a phone held close produces.
 * Browsers without it (Safari, Firefox, iOS) use ZXing only.
 */
interface NativeDetector {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]>;
}
interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/** Built-in format names, mapped to the names ZXing reports, so both look the same downstream. */
const NATIVE_FORMATS: Record<string, string> = {
  ean_13: "EAN-13",
  ean_8: "EAN-8",
  upc_a: "UPC-A",
  upc_e: "UPC-E",
  itf: "ITF",
  code_128: "Code128",
  code_39: "Code39",
  code_93: "Code93",
  codabar: "Codabar",
  qr_code: "QRCode",
  data_matrix: "DataMatrix",
};

let nativeDetector: Promise<NativeDetector | null> | undefined;

function getNativeDetector(): Promise<NativeDetector | null> {
  nativeDetector ??= (async () => {
    const Detector = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
    if (!Detector) return null;
    try {
      const supported = new Set(await Detector.getSupportedFormats());
      // Rely on it only when it reads retail and Code 128 labels; otherwise ZXing does everything.
      if (!supported.has("ean_13") || !supported.has("code_128")) return null;
      return new Detector({ formats: Object.keys(NATIVE_FORMATS).filter((f) => supported.has(f)) });
    } catch {
      return null;
    }
  })();
  return nativeDetector;
}

export async function hasNativeDetector(): Promise<boolean> {
  return (await getNativeDetector()) !== null;
}

/** Reads with the built-in detector; an empty list if there is none or it found nothing. */
export async function decodeWithNative(source: ImageBitmapSource): Promise<DecodedBarcode[]> {
  const detector = await getNativeDetector();
  if (!detector) return [];
  try {
    const found = await detector.detect(source);
    return found
      .filter((f) => f.rawValue)
      .map((f) => {
        let format = NATIVE_FORMATS[f.format] ?? f.format;
        // A 14-digit interleaved 2 of 5 code is an ITF-14 (a GTIN), as ZXing reports it.
        if (format === "ITF" && /^\d{14}$/.test(f.rawValue)) format = "ITF14";
        return { text: f.rawValue, format };
      });
  } catch {
    return [];
  }
}

/** A still image (a chosen photo): the built-in detector first, then ZXing. */
export async function decodeImage(image: ImageData): Promise<DecodedBarcode[]> {
  const native = await decodeWithNative(image);
  return native.length > 0 ? native : decodeWithZxing(image);
}

/**
 * The middle of a camera frame at full resolution: 84% of the width and 56% of the height,
 * slightly larger than the on-screen guide box. Shrinking the whole frame instead cost ZXing most
 * of its reads on small barcodes, because each bar was left only a pixel or two wide.
 */
export const CENTRE_REGION = { width: 0.84, height: 0.56 };
