import { describe, expect, it } from "vitest";
import { clientAddress } from "../src/middleware/rateLimit.js";

const request = (ip: string | undefined, headers: Record<string, string> = {}) => ({
  ip,
  get: (name: string) => headers[name.toLowerCase()],
});

describe("clientAddress", () => {
  it("uses the configured edge header when present", () => {
    expect(clientAddress(request("10.0.0.1", { "cf-connecting-ip": "203.0.113.7" }), "cf-connecting-ip")).toBe("203.0.113.7");
  });

  it("takes the first address if the header holds a list", () => {
    expect(clientAddress(request("10.0.0.1", { "cf-connecting-ip": "203.0.113.7, 10.0.0.2" }), "cf-connecting-ip")).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to req.ip when the header is missing or not configured", () => {
    expect(clientAddress(request("198.51.100.4"), "cf-connecting-ip")).toBe("198.51.100.4");
    expect(clientAddress(request("198.51.100.4", { "cf-connecting-ip": "203.0.113.7" }), undefined)).toBe("198.51.100.4");
  });

  it("ignores X-Forwarded-For, which clients can set themselves", () => {
    expect(clientAddress(request("198.51.100.4", { "x-forwarded-for": "1.2.3.4" }), "cf-connecting-ip")).toBe("198.51.100.4");
  });

  it("groups IPv6 clients by /56 subnet so one host cannot rotate addresses", () => {
    const a = clientAddress(request("2001:db8:abcd:12::1"), undefined);
    const b = clientAddress(request("2001:db8:abcd:12::ffff"), undefined);
    expect(a).toBe(b);
  });
});
