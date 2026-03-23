import { describe, expect, it } from "vitest";
import { normalizeHeader } from "@/lib/normalization/header";
import { normalizeAmount, normalizeDate, normalizeCellValue } from "@/lib/normalization/values";

describe("header normalization", () => {
  it("expands abbreviations and removes punctuation", () => {
    expect(normalizeHeader("Txn_Ref No.")).toBe("transaction reference number");
  });

  it("splits camel case", () => {
    expect(normalizeHeader("AuthorizedAmount")).toBe("authorized amount");
  });
});

describe("value normalization", () => {
  it("normalizes amounts while preserving sign", () => {
    expect(normalizeAmount("$01,200.5000")).toBe("1200.5");
    expect(normalizeAmount("-00035.90")).toBe("-35.9");
  });

  it("normalizes dates into ISO form when parsable", () => {
    expect(normalizeDate("01/03/2026")).toBe("2026-03-01");
    expect(normalizeCellValue("2026-03-01")).toBe("2026-03-01");
  });

  it("keeps long ids as string-like normalized values", () => {
    expect(normalizeCellValue("0001234567890123")).toBe("0001234567890123");
  });
});
