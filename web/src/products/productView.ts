import type { Product } from "../api/types";

export type StatusFilter = "all" | "low" | "out";
export type SortOrder = "name" | "quantity-asc" | "quantity-desc";

export const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All products" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
];

export const sortOptions: { value: SortOrder; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "quantity-asc", label: "Lowest quantity" },
  { value: "quantity-desc", label: "Highest quantity" },
];

const isOneOf = <T extends string>(options: { value: T }[], value: string | null): value is T =>
  options.some((option) => option.value === value);

/** Reads the filter and sort from URL parameters, ignoring anything unrecognised. */
export function readView(params: URLSearchParams): { status: StatusFilter; sort: SortOrder } {
  const status = params.get("status");
  const sort = params.get("sort");
  return {
    status: isOneOf(statusOptions, status) ? status : "all",
    sort: isOneOf(sortOptions, sort) ? sort : "name",
  };
}

/**
 * Filters and orders the products the server returned. "Low stock" uses the server's
 * isLowStock flag, so it always matches the dashboard count (out-of-stock products included).
 * The server already sorts by name, and Array.sort is stable, so ties keep name order.
 */
export function applyView(products: Product[], status: StatusFilter, sort: SortOrder): Product[] {
  const filtered = products.filter((product) => {
    if (status === "low") return product.isLowStock;
    if (status === "out") return product.quantityOnHand === 0;
    return true;
  });
  if (sort === "quantity-asc") return [...filtered].sort((a, b) => a.quantityOnHand - b.quantityOnHand);
  if (sort === "quantity-desc") return [...filtered].sort((a, b) => b.quantityOnHand - a.quantityOnHand);
  return filtered;
}
