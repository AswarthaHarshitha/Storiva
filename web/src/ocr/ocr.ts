import type { Worker } from "tesseract.js";

// Optical character recognition runs entirely in the browser with Tesseract, served from
// Storiva's own origin (see scripts/copy-ocr-assets.mjs). Images never leave the device.

let worker: Promise<Worker> | null = null;

function getWorker() {
  worker ??= import("tesseract.js").then(({ createWorker }) =>
    createWorker("eng", 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr",
      langPath: "/ocr",
      // A same-origin worker script instead of a blob: URL, which the CSP does not allow.
      workerBlobURL: false,
      cacheMethod: "none",
    }),
  );
  return worker;
}

export interface OcrResult {
  text: string;
  /** Tesseract's own average word confidence, 0–100. */
  confidence: number;
}

export async function readText(image: Blob): Promise<OcrResult> {
  const w = await getWorker();
  const { data } = await w.recognize(image);
  return { text: data.text, confidence: Math.round(data.confidence) };
}

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Checks a chosen file before it is read: images only, and not too large. */
export function checkImageFile(file: File): string | null {
  if (!TYPES.includes(file.type)) return "Choose a JPEG, PNG or WebP photo.";
  if (file.size > MAX_BYTES) return "The photo is larger than 10 MB. Take a smaller one.";
  return null;
}
