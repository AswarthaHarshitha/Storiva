export interface Account {
  id: string;
  email: string;
  organization: { id: string; name: string };
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  quantityOnHand: number;
  costPrice: string | null;
  sellingPrice: string | null;
  lowStockThreshold: number | null;
  effectiveThreshold: number;
  isLowStock: boolean;
  lastAdjustmentNote: string | null;
  lastUpdatedBy: string | null;
  barcodes: ProductBarcode[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductBarcode {
  id: string;
  code: string;
  kind: "gtin" | "other";
}

export interface ProductPayload {
  name: string;
  sku: string;
  description: string | null;
  quantityOnHand: number;
  costPrice: string | null;
  sellingPrice: string | null;
  lowStockThreshold: number | null;
  barcodes?: string[];
}

export interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  quantityOnHand: number;
  lowStockThreshold: number | null;
  effectiveThreshold: number;
}

export interface Dashboard {
  organizationName: string;
  defaultLowStockThreshold: number;
  totalProducts: number;
  totalQuantity: number;
  lowStockCount: number;
  lowStockItems: LowStockItem[];
}

export interface Settings {
  organizationName: string;
  defaultLowStockThreshold: number;
}

export interface BarcodeLookup {
  code: string;
  kind: "gtin" | "other";
  matchedBy: "barcode" | "sku" | null;
  product: Product | null;
}

export type StockMovementType = "create" | "edit" | "adjust" | "receive" | "issue" | "count";
export type StockMovementSource = "manual" | "camera" | "scanner";

export interface StockMovement {
  id: string;
  type: StockMovementType;
  source: StockMovementSource;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  note: string | null;
  user: string | null;
  createdAt: string;
}

export type StockOperationRequest = {
  productId: string;
  source: StockMovementSource;
  note: string | null;
  idempotencyKey: string;
} & ({ type: "receive" | "issue"; quantity: number } | { type: "count"; countedQuantity: number; expectedQuantity: number });

export interface StockOperationResult {
  movement: StockMovement;
  product: Product;
  replayed: boolean;
}
