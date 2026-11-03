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

export async function decodeImage(image: ImageData): Promise<DecodedBarcode[]> {
  const results = await readBarcodes(image, { formats: SCAN_FORMATS, tryHarder: true, maxNumberOfSymbols: 1 });
  return results.filter((r) => r.isValid && r.text).map((r) => ({ text: r.text, format: r.format }));
}
