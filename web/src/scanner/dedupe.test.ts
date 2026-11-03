import { describe, expect, it } from "vitest";
import { looksLikeHardwareScanner, ScanDeduplicator } from "./dedupe";

describe("ScanDeduplicator", () => {
  it("reports a code once while it stays in view", () => {
    const d = new ScanDeduplicator(1000);
    expect(d.accept("A", 0)).toBe(true);
    expect(d.accept("A", 200)).toBe(false);
    expect(d.accept("A", 900)).toBe(false);
    expect(d.accept("A", 1800)).toBe(false); // still seen every few hundred ms
  });

  it("reports the same code again after it has left the view", () => {
    const d = new ScanDeduplicator(1000);
    d.accept("A", 0);
    expect(d.accept("A", 1500)).toBe(true);
  });

  it("reports a different code immediately", () => {
    const d = new ScanDeduplicator(1000);
    d.accept("A", 0);
    expect(d.accept("B", 100)).toBe(true);
    expect(d.accept("A", 200)).toBe(true);
  });

  it("forgets the last code on reset", () => {
    const d = new ScanDeduplicator(1000);
    d.accept("A", 0);
    d.reset();
    expect(d.accept("A", 100)).toBe(true);
  });
});

describe("looksLikeHardwareScanner", () => {
  it("recognises fast, evenly spaced keystrokes", () => {
    expect(looksLikeHardwareScanner([0, 8, 16, 25, 33, 41, 50, 58, 66, 75, 83, 91, 100], 13)).toBe(true);
  });

  it("treats human typing as manual", () => {
    expect(looksLikeHardwareScanner([0, 180, 350, 560, 700, 910], 6)).toBe(false);
  });

  it("needs a few characters before deciding", () => {
    expect(looksLikeHardwareScanner([0, 5], 2)).toBe(false);
  });
});
