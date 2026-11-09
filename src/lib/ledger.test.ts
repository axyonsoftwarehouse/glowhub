import { describe, expect, it } from "vitest";
import { reverseLines } from "./ledger";

describe("reverseLines", () => {
  it("troca débito por crédito mantendo conta e valor", () => {
    expect(
      reverseLines([
        { accountId: "conta-a", direction: "debit", amountCents: 1500 },
        { accountId: "conta-b", direction: "credit", amountCents: 1500 },
      ]),
    ).toEqual([
      { accountId: "conta-a", direction: "credit", amountCents: 1500 },
      { accountId: "conta-b", direction: "debit", amountCents: 1500 },
    ]);
  });

  it("não muta as partidas originais", () => {
    const original = [
      { accountId: "conta-a", direction: "debit" as const, amountCents: 100 },
    ];
    reverseLines(original);
    expect(original[0].direction).toBe("debit");
  });
});
