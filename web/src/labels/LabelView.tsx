import { useEffect, useState } from "react";
import { barcodeDataUrl, type LabelSymbology } from "./barcodeImage";
import type { LabelItem, LabelLayout } from "./layouts";

/** One label, drawn at its real size in millimetres. */
export function LabelView({ item, layout, symbology, showPrice }: { item: LabelItem; layout: LabelLayout; symbology: LabelSymbology; showPrice: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    barcodeDataUrl(item.sku, symbology).then(
      (url) => live && setSrc(url),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [item.sku, symbology]);

  const small = layout.height < 30;
  const qr = symbology === "qr";
  return (
    <div
      className="flex overflow-hidden bg-white text-black"
      style={{ width: `${layout.width}mm`, height: `${layout.height}mm`, padding: "1.5mm", flexDirection: qr ? "row" : "column", gap: "1mm" }}
    >
      {qr && <div style={{ height: "100%", aspectRatio: "1" }}>{src && <img src={src} alt="" style={{ width: "100%", height: "100%" }} />}</div>}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ gap: "0.5mm" }}>
        <p className="font-semibold leading-tight" style={{ fontSize: small ? "2.4mm" : "3mm", display: "-webkit-box", WebkitLineClamp: qr ? 3 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {item.name}
        </p>
        {!qr && (
          <div className="min-h-0 flex-1">
            {src && <img src={src} alt={`Code 128 barcode for ${item.sku}`} style={{ display: "block", width: "100%", height: "100%", objectFit: "fill" }} />}
            {failed && <p style={{ fontSize: "2.2mm" }}>This SKU cannot be encoded.</p>}
          </div>
        )}
        <p className="flex justify-between font-mono" style={{ fontSize: small ? "2.2mm" : "2.6mm" }}>
          <span className="truncate">{item.sku}</span>
          {showPrice && item.price && <span className="font-sans font-semibold">{item.price}</span>}
        </p>
      </div>
    </div>
  );
}
