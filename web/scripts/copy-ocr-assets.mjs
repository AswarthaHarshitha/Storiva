// Copies the OCR engine (Tesseract, Apache-2.0) and its English model into public/ocr so they
// are served by Storiva itself rather than fetched from a CDN at runtime.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const out = new URL("../public/ocr/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const tesseract = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(require.resolve("tesseract.js-core/package.json", { paths: [tesseract] }));
const lang = dirname(require.resolve("@tesseract.js-data/eng/package.json"));

copyFileSync(join(tesseract, "dist/worker.min.js"), join(out, "worker.min.js"));
for (const variant of ["tesseract-core-lstm", "tesseract-core-simd-lstm", "tesseract-core-relaxedsimd-lstm"]) {
  copyFileSync(join(core, `${variant}.wasm.js`), join(out, `${variant}.wasm.js`));
}
copyFileSync(join(lang, "4.0.0_best_int/eng.traineddata.gz"), join(out, "eng.traineddata.gz"));
console.log("OCR assets copied to public/ocr");
