import { Barcode, Bot, Camera, ClipboardList, FileSpreadsheet, Radar, TriangleAlert, Truck, LineChart } from "lucide-react";

/** Advanced tools, shown only when the person turns them on. */
export const advancedNavItems = [
  { to: "/copilot", label: "Copilot", icon: Bot, description: "Ask about your stock in plain words; changes need your confirmation." },
  { to: "/trust", label: "Trust Radar", icon: Radar, description: "How far each recorded quantity can be relied on, and what to count next." },
  { to: "/exceptions", label: "Exceptions", icon: TriangleAlert, description: "Count differences, large corrections and other problems to review." },
  { to: "/receiving", label: "Receiving", icon: ClipboardList, description: "Record deliveries by hand or from an invoice photo." },
  { to: "/suppliers", label: "Suppliers", icon: Truck, description: "Suppliers and how their deliveries compared with what was expected." },
  { to: "/bulk", label: "Import & export", icon: FileSpreadsheet, description: "Add or update many products from a CSV file, or download them." },
  { to: "/labels", label: "Labels", icon: Barcode, description: "Print Code 128 or QR labels on thermal rolls or A4 sheets." },
  { to: "/identify", label: "Identify by photo", icon: Camera, description: "Suggest a product from a photo's barcode or printed words." },
  { to: "/reports", label: "Reports & simulator", icon: LineChart, description: "Stock value, slow-moving stock and what-if scenarios." },
];
