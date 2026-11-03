export type ScanMode = "find" | "receive" | "issue" | "count" | "add";

export const scanModes: { value: ScanMode; label: string; hint: string }[] = [
  { value: "find", label: "Find", hint: "Scan to open a product." },
  { value: "receive", label: "Receive", hint: "Scan goods arriving, then enter how many." },
  { value: "issue", label: "Issue", hint: "Scan goods leaving, then enter how many." },
  { value: "count", label: "Count", hint: "Scan a product and enter how many you physically counted." },
  { value: "add", label: "Add new", hint: "Scan a new item to create a product with its barcode." },
];

export const isScanMode = (value: string | null): value is ScanMode => scanModes.some((m) => m.value === value);
