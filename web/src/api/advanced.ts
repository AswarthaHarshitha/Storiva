// Response shapes of the advanced endpoints (server/src/controllers/advancedController.ts).

export type EvidenceStatus = "verified" | "documented" | "entered" | "unverified";

export interface EvidenceRecord {
  value: string | null;
  source: string;
  status: EvidenceStatus;
  detail: string | null;
  reference: { type: string; id: string } | null;
  recordedAt: string;
  by: string | null;
}

export interface ProductEvidence {
  fields: { field: string; label: string; value: string | null; origin: EvidenceRecord | null; history: EvidenceRecord[] }[];
  quantity: {
    value: number;
    lastCount: { date: string; quantity: number; difference: number; by: string | null } | null;
    changesSinceCount: number;
    historyStartsAt: string | null;
  };
}

export type TrustLevel = "high" | "medium" | "low" | "unverified";

export interface ProductTrust {
  id: string;
  name: string;
  sku: string;
  level: TrustLevel;
  reasons: string[];
  recommendation: string;
  currentQuantity: number;
  lastCount: { date: string; countedQuantity: number; difference: number } | null;
  daysSinceCount: number | null;
  unresolvedDifference: number | null;
  correctionsSinceCount: number;
  changesSinceCount: number;
}

export interface TrustOverview {
  summary: Record<TrustLevel, number>;
  products: ProductTrust[];
  queue: ProductTrust[];
}

export interface InventoryException {
  id: string;
  type: string;
  title: string;
  detail: Record<string, unknown> & { recommendation?: string };
  status: "open" | "resolved" | "dismissed";
  product: { id: string; name: string; sku: string } | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ExceptionList {
  exceptions: InventoryException[];
  openByType: Record<string, number>;
}

export interface Reliability {
  receipts: number;
  linesWithExpectedQuantity: number;
  fillRate: number | null;
  shortLines: number;
  damagedRate: number | null;
  deliveriesWithDueDate: number;
  lateDeliveries: number;
}

export interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  reliability: Reliability | null;
}

export interface ReceiptSummary {
  id: string;
  reference: string | null;
  supplier: { id: string; name: string } | null;
  status: "draft" | "confirmed";
  source: string;
  documentDate: string | null;
  totalAmount: string | null;
  lineCount: number;
  confirmedAt: string | null;
  createdAt: string;
}

export interface ReceiptLine {
  id?: string;
  productId: string | null;
  description: string;
  expectedQuantity: number | null;
  receivedQuantity: number;
  damagedQuantity: number;
  unitCost: string | null;
  updateCost: boolean;
  matchConfidence: string | null;
  product?: { id: string; name: string; sku: string; quantityOnHand: number; costPrice: string | null } | null;
}

export interface Receipt {
  id: string;
  reference: string | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  documentDate: string | null;
  expectedDate: string | null;
  status: "draft" | "confirmed";
  source: "manual" | "invoice";
  documentText: string | null;
  totalAmount: string | null;
  notes: string | null;
  confirmedAt: string | null;
  lines: ReceiptLine[];
}

export type ReceiptPayload = Omit<Receipt, "id" | "supplier" | "status" | "confirmedAt" | "lines"> & { lines: Omit<ReceiptLine, "id" | "product">[] };

export interface ParsedInvoice {
  supplier: string | null;
  supplierMatch: { id: string; name: string; confidence: string } | null;
  invoiceNumber: string | null;
  date: string | null;
  total: string | null;
  unreadLines: string[];
  lines: {
    description: string;
    quantity: number;
    unitCost: string | null;
    amount: string | null;
    consistent: boolean | null;
    matches: { productId: string; name: string; sku: string; currentCost: string | null; confidence: string; reason: string }[];
  }[];
}

export interface ImportRowPlan {
  row: number;
  sku: string;
  action: "create" | "update" | "unchanged" | "error";
  name: string | null;
  changes: { field: string; from: string | null; to: string | null }[];
  quantityDelta: number;
  errors: { field: string; message: string }[];
}

export interface ImportSummary {
  total: number;
  create: number;
  update: number;
  unchanged: number;
  errors: number;
  stockChanges: number;
}

export interface CopilotReply {
  intent: string;
  text: string;
  items?: { id: string | null; name: string; sku: string; detail: string }[];
  proposal?: { productId: string; name: string; sku: string; delta: number; expectedQuantity: number; resultingQuantity: number; summary: string };
  candidates?: { id: string; name: string; sku: string; quantity: number }[];
}

export interface Simulation {
  product: { id: string; name: string; sku: string };
  actual: { quantity: number; valueAtCost: string | null; valueAtPrice: string | null; marginPerUnit: string | null };
  projected: { quantity: number; purchaseCost: string | null; valueAtCost: string | null; valueAtPrice: string | null; marginPerUnit: string | null };
  demand: { dailyUnits: number; units: number; days: number; events: number } | null;
  cover: { current: number; projected: number; stockoutDate: string | null; atDelivery: number | null; adjustedDailyUnits: number } | null;
  shortfallRisk: boolean | null;
  assumptions: string[];
  uncertainty: string[];
}

export interface Reports {
  valuation: { atCost: string; atSellingPrice: string; productsInStock: number; missingCost: number; missingPrice: number };
  slowMoving: { days: number; products: { id: string; name: string; sku: string; quantity: number; valueAtCost: string | null }[]; capitalAtCost: string; withoutCost: number; tooNewToJudge: number };
  corrections: { productId: string | null; name: string; sku: string; corrections: number; netChange: number }[];
}

export interface TextMatch {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  confidence: "exact" | "high" | "medium" | "low";
  reason: string;
}
