import { describe, expect, it } from "vitest";
import { productFormSchema, signupSchema, thresholdSchema, toProductPayload, validate, type ProductFormValues } from "./validation";

const product = (overrides: Partial<ProductFormValues> = {}): ProductFormValues => ({
  barcode: "",
  name: "Stoneware mug",
  sku: "MUG-01",
  description: "",
  quantityOnHand: "12",
  lowStockThreshold: "",
  costPrice: "",
  sellingPrice: "",
  ...overrides,
});

describe("product form", () => {
  it("accepts a minimal valid product", () => {
    expect(validate(productFormSchema, product())).toBeNull();
  });

  it.each([
    [{ name: "  " }, "name", "Name is required."],
    [{ sku: "has space" }, "sku", "Use letters, numbers, dots, dashes, slashes or underscores."],
    [{ quantityOnHand: "" }, "quantityOnHand", "Quantity is required."],
    [{ quantityOnHand: "-1" }, "quantityOnHand", "Quantity cannot be negative."],
    [{ quantityOnHand: "2.5" }, "quantityOnHand", "Quantity must be a whole number."],
    [{ quantityOnHand: "1000000001" }, "quantityOnHand", "Quantity is too large."],
    [{ lowStockThreshold: "abc" }, "lowStockThreshold", "Threshold must be a whole number."],
    [{ sellingPrice: "4.999" }, "sellingPrice", "Selling price must be a non-negative amount with up to 2 decimals."],
    [{ costPrice: "-2" }, "costPrice", "Cost price must be a non-negative amount with up to 2 decimals."],
  ])("rejects %j", (overrides, field, message) => {
    expect(validate(productFormSchema, product(overrides))?.[field]).toBe(message);
  });

  it("converts form strings into the API payload", () => {
    expect(
      toProductPayload(product({ name: " Mug ", description: "  ", lowStockThreshold: "4", sellingPrice: "9.5", costPrice: " " })),
    ).toEqual({
      name: "Mug",
      sku: "MUG-01",
      description: null,
      quantityOnHand: 12,
      lowStockThreshold: 4,
      costPrice: null,
      sellingPrice: "9.5",
    });
  });

  it("sends a blank threshold as null so the organization default applies", () => {
    expect(toProductPayload(product({ lowStockThreshold: "" })).lowStockThreshold).toBeNull();
  });
});

describe("signup form", () => {
  const valid = { organizationName: "Corner Shop", email: "owner@example.com", password: "secret123", confirmPassword: "secret123" };

  it("accepts valid input", () => {
    expect(validate(signupSchema, valid)).toBeNull();
  });

  it("requires the confirmation to match", () => {
    expect(validate(signupSchema, { ...valid, confirmPassword: "secret124" })?.confirmPassword).toBe("Passwords do not match.");
  });

  it("requires a letter and a number", () => {
    expect(validate(signupSchema, { ...valid, password: "12345678", confirmPassword: "12345678" })?.password).toBe(
      "Include at least one letter and one number.",
    );
  });
});

describe("settings form", () => {
  it("accepts zero and rejects negatives", () => {
    expect(validate(thresholdSchema, { defaultLowStockThreshold: "0" })).toBeNull();
    expect(validate(thresholdSchema, { defaultLowStockThreshold: "-1" })?.defaultLowStockThreshold).toBe("Threshold cannot be negative.");
  });
});
