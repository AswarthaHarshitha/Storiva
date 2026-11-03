import { describe, expect, it } from "vitest";
import { createOpenFactsProvider } from "../src/catalogue/openFacts.js";
import { ProviderUnavailableError, type Fetch } from "../src/catalogue/types.js";
import { createUpcItemDbProvider } from "../src/catalogue/upcItemDb.js";

const signal = new AbortController().signal;
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

/** A fake network that answers by URL and records what was requested. */
function fakeFetch(answer: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn: Fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return answer(url);
  };
  return { fn, calls };
}

// Shape of a real Open Food Facts v2 response (fields as returned on 4 November 2026).
const nutella = {
  code: "3017620422003",
  status: 1,
  product: {
    product_name: "Nutella",
    generic_name: "Hazelnut And Cocoa Spread",
    brands: "Nutella, Ferrero",
    brands_owner: "Ferrero",
    categories: "Snacks, Cocoa powders, Confectionary based spreads",
    quantity: "400 g",
    image_front_url: "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.400.jpg",
    product_type: "food",
  },
};

describe("Open Food Facts provider", () => {
  it("maps a found product and identifies Storiva in the User-Agent", async () => {
    const net = fakeFetch(() => json(200, nutella));
    const result = await createOpenFactsProvider(net.fn, "Storiva/1.0 (+https://example.test)").lookup("3017620422003", signal);
    expect(result).toEqual({
      status: "found",
      sourceName: "Open Food Facts",
      sourceUrl: "https://world.openfoodfacts.org/product/3017620422003",
      product: {
        name: "Nutella",
        brand: "Nutella",
        description: "Hazelnut And Cocoa Spread, 400 g",
        manufacturer: "Ferrero",
        category: "Snacks",
        imageUrl: "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.400.jpg",
      },
    });
    expect(net.calls[0]?.url).toContain("/api/v2/product/3017620422003.json?product_type=all");
    expect(new Headers(net.calls[0]?.init?.headers).get("User-Agent")).toBe("Storiva/1.0 (+https://example.test)");
  });

  it("reports not found for the API's 404 with status 0", async () => {
    const net = fakeFetch(() => json(404, { code: "0000000000000", status: 0, status_verbose: "product not found" }));
    expect(await createOpenFactsProvider(net.fn, "x").lookup("0000000000000", signal)).toEqual({ status: "not_found" });
  });

  it("treats a product with no usable fields as not found", async () => {
    const net = fakeFetch(() => json(200, { status: 1, product: { product_name: "  ", brands: "" } }));
    expect(await createOpenFactsProvider(net.fn, "x").lookup("123", signal)).toEqual({ status: "not_found" });
  });

  it("follows a redirect to a sister project and names it as the source", async () => {
    const net = fakeFetch((url) =>
      url.startsWith("https://world.openfoodfacts.org")
        ? new Response(null, { status: 302, headers: { Location: "https://world.openproductsfacts.org/api/v2/product/5449000000996.json" } })
        : json(200, { status: 1, product: { product_name: "Desk lamp", product_type: "product" } }),
    );
    const result = await createOpenFactsProvider(net.fn, "x").lookup("5449000000996", signal);
    expect(result).toMatchObject({ status: "found", sourceName: "Open Products Facts", product: { name: "Desk lamp" } });
    expect(net.calls).toHaveLength(2);
  });

  it("refuses to follow a redirect to any other host", async () => {
    const net = fakeFetch(() => new Response(null, { status: 302, headers: { Location: "https://evil.example/steal" } }));
    await expect(createOpenFactsProvider(net.fn, "x").lookup("1", signal)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(net.calls).toHaveLength(1);
  });

  it("drops images that are not on the catalogue's image servers", async () => {
    const net = fakeFetch(() =>
      json(200, { status: 1, product: { product_name: "X", image_front_url: "https://tracker.example/pixel.gif" } }),
    );
    expect(await createOpenFactsProvider(net.fn, "x").lookup("1", signal)).toMatchObject({ product: { imageUrl: null } });
  });

  it.each([
    ["a server error", () => new Response("oops", { status: 503 })],
    ["invalid JSON", () => new Response("<html>", { status: 200 })],
    ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
  ])("reports the provider as unavailable on %s", async (_label, answer) => {
    const net = fakeFetch(answer);
    await expect(createOpenFactsProvider(net.fn, "x").lookup("1", signal)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe("UPCitemdb provider", () => {
  it("maps the first item and never uses retailer images", async () => {
    const net = fakeFetch(() =>
      json(200, {
        code: "OK",
        items: [{ title: "Wireless Mouse M185", brand: "Logitech", description: "2.4 GHz mouse", category: "Electronics > Mice", images: ["https://shop.example/a.jpg"] }],
      }),
    );
    expect(await createUpcItemDbProvider(net.fn).lookup("0097855066602", signal)).toMatchObject({
      status: "found",
      product: { name: "Wireless Mouse M185", brand: "Logitech", category: "Mice", imageUrl: null, manufacturer: null },
    });
  });

  it("reports not found when there are no items", async () => {
    const net = fakeFetch(() => json(200, { code: "OK", total: 0, items: [] }));
    expect(await createUpcItemDbProvider(net.fn).lookup("1", signal)).toEqual({ status: "not_found" });
  });

  it("reports the provider as unavailable when rate limited", async () => {
    const net = fakeFetch(() => json(429, { code: "TOO_FAST" }));
    await expect(createUpcItemDbProvider(net.fn).lookup("1", signal)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});
