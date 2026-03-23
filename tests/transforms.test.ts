import { describe, expect, it } from "vitest";
import { datePart, normalizeAmountLike, panFingerprint, stripPaddedNumeric } from "@/lib/correlation/transforms";

describe("correlation transforms", () => {
  it("extracts date part from datetime-like values", () => {
    expect(datePart("2026-03-01T10:22:33")).toBe("2026-03-01");
    expect(datePart("01/03/2026 10:22")).toBe("2026-03-01");
  });

  it("normalizes amount-like values", () => {
    expect(normalizeAmountLike("$01,200.5000")).toBe("1200.5");
    expect(normalizeAmountLike("-00035.90")).toBe("-35.9");
  });

  it("builds PAN fingerprint from full and masked values", () => {
    expect(panFingerprint("1234567812341111")).toBe("123456781111");
    expect(panFingerprint("12345678xxxx1111")).toBe("123456781111");
  });

  it("strips numeric padding", () => {
    expect(stripPaddedNumeric("000123400")).toBe("123400");
    expect(stripPaddedNumeric("AB-001")).toBe("ab-001");
  });
});
