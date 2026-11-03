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
  createdAt: string;
  updatedAt: string;
}

export interface ProductPayload {
  name: string;
  sku: string;
  description: string | null;
  quantityOnHand: number;
  costPrice: string | null;
  sellingPrice: string | null;
  lowStockThreshold: number | null;
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
