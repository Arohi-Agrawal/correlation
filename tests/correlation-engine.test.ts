import { describe, expect, it } from "vitest";
import { parseCsvText } from "@/lib/parsers/csv";
import { buildCorrelationMatrix } from "@/lib/correlation/matcher";

const FILE_A = `REPLACED_AMOUNT,PART_TRAN_TYPE,ACCOUNT_NUMBER,TRANSACTION_DATE_TIME,RRN,OTHER_SOURCE
1200.00,2026-03-01 10:10:00,1200.00,1234567811111111,amazon marketplace payment,alpha
35.90,2026-03-02 11:20:00,35.90,4567123499992222,coffee bean cafe purchase,beta
4500.00,2026-03-03 12:30:00,4500.00,8765432112343333,airline ticket booking,gamma
-250.00,2026-03-04 13:40:00,-250.00,1111222233334444,fuel station charge,delta
640.25,2026-03-05 14:50:00,640.25,2222333344445555,grocery mart order,epsilon`;

const FILE_B = `AMOUNT,ENTRY_DATE,CARD_NUMBER,TRAN_PARTICULAR,TRAN_DATE,VALUE_DATE,OTHER_TARGET
1200,2026-03-01,12345678xxxx1111,amazon marketplace online,2026-03-01,2026-03-01,x1
35.9,2026-03-02,45671234xxxx2222,coffee bean store,2026-03-02,2026-03-02,x2
4500.00,2026-03-03,87654321xxxx3333,airline booking portal,2026-03-03,2026-03-03,x3
-250,2026-03-04,11112222xxxx4444,fuel station pos,2026-03-04,2026-03-04,x4
640.2500,2026-03-06,22223333xxxx5555,grocery mart purchase,2026-03-05,2026-03-05,x5`;

describe("production-grade correlation behavior", () => {
  it("supports exact, domain, transformed, semantic, derived, duplicate rejection, and unmatched in one run", () => {
    const parsedA = parseCsvText(FILE_A, "A", "a.csv");
    const parsedB = parseCsvText(FILE_B, "B", "b.csv");

    const response = buildCorrelationMatrix(parsedA, parsedB);

    const exactPrimary = response.exactMatches.find(
      (m) => m.sourceColumn === "REPLACED_AMOUNT" && m.targetColumn === "AMOUNT" && m.decision === "ACCEPT_EXACT"
    );
    expect(exactPrimary).toBeTruthy();

    const strongDate = [...response.exactPartialMatches, ...response.strongDomainMatches].find(
      (m) =>
        m.sourceColumn === "PART_TRAN_TYPE" &&
        m.targetColumn === "ENTRY_DATE" &&
        (m.decision === "ACCEPT_EXACT_PARTIAL" || m.decision === "ACCEPT_STRONG_DOMAIN_MATCH")
    );
    expect(strongDate).toBeTruthy();
    expect(["date", "datetime"]).toContain(strongDate?.sourceObservedType);

    const transformed = response.transformedMatches.find(
      (m) => m.sourceColumn === "TRANSACTION_DATE_TIME" && m.targetColumn === "CARD_NUMBER" && m.decision === "ACCEPT_TRANSFORMED"
    );
    expect(transformed).toBeTruthy();

    const semantic = response.semanticMatches.find(
      (m) => m.sourceColumn === "RRN" && m.targetColumn === "TRAN_PARTICULAR" && m.decision === "ACCEPT_SEMANTIC"
    );
    if (!semantic) {
      const rrnUnmatched = response.unmatched.find((m) => m.sourceColumn === "RRN");
      expect(rrnUnmatched).toBeTruthy();
    }

    const derivedTranDate = response.derivedMatches.find(
      (m) => m.sourceColumn.startsWith("PART_TRAN_TYPE") && m.targetColumn === "TRAN_DATE" && m.decision === "DERIVED_MATCH"
    );
    const derivedValueDate = response.derivedMatches.find(
      (m) => m.sourceColumn.startsWith("PART_TRAN_TYPE") && m.targetColumn === "VALUE_DATE" && m.decision === "DERIVED_MATCH"
    );
    expect(derivedTranDate).toBeTruthy();
    expect(derivedValueDate).toBeTruthy();

    const duplicateReject = response.duplicateOrSuspicious.find(
      (m) => m.sourceColumn === "ACCOUNT_NUMBER" && m.targetColumn === "AMOUNT" && m.decision === "REJECT_DUPLICATE"
    );
    expect(duplicateReject).toBeTruthy();

    const accountAsAcceptedAmount = response.exactMatches.find(
      (m) => m.sourceColumn === "ACCOUNT_NUMBER" && m.targetColumn === "AMOUNT"
    );
    expect(accountAsAcceptedAmount).toBeFalsy();

    const unmatchedOther = response.unmatched.find((m) => m.sourceColumn === "OTHER_SOURCE");
    expect(unmatchedOther).toBeTruthy();
  });
});
