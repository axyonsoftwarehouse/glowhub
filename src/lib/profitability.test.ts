import { describe, expect, it } from "vitest";
import {
  cashFlowByDay,
  computeDre,
  marginCents,
  marginPercent,
  rankProfitability,
} from "./profitability";

describe("computeDre", () => {
  it("calcula o DRE completo", () => {
    const dre = computeDre([
      { type: "revenue", systemKey: "revenue_service", net: 10000 },
      { type: "revenue", systemKey: "revenue_product", net: 5000 },
      { type: "expense", systemKey: "expense_discount", net: 1000 },
      { type: "expense", systemKey: "expense_cogs", net: 4000 },
      { type: "expense", systemKey: "expense_commission", net: 2000 },
      { type: "expense", systemKey: null, net: 1500 },
    ]);
    expect(dre.revenue).toBe(15000);
    expect(dre.deductions).toBe(1000);
    expect(dre.cogs).toBe(4000);
    expect(dre.grossProfit).toBe(10000);
    expect(dre.operatingExpenses).toBe(3500);
    expect(dre.netProfit).toBe(6500);
  });

  it("ignora contas patrimoniais", () => {
    const dre = computeDre([
      { type: "asset", systemKey: "cash", net: 99999 },
      { type: "revenue", systemKey: "revenue_service", net: 100 },
    ]);
    expect(dre.revenue).toBe(100);
    expect(dre.netProfit).toBe(100);
  });
});

describe("margem", () => {
  it("calcula centavos e percentual", () => {
    expect(marginCents(10000, 4000)).toBe(6000);
    expect(marginPercent(10000, 4000)).toBe(60);
    expect(marginPercent(10000, 11000)).toBe(-10);
  });

  it("sem receita a margem percentual e zero", () => {
    expect(marginPercent(0, 500)).toBe(0);
  });
});

describe("rankProfitability", () => {
  it("ordena do maior lucro para o prejuizo", () => {
    const rows = rankProfitability([
      { key: "a", label: "A", revenueCents: 1000, costCents: 1500 },
      { key: "b", label: "B", revenueCents: 1000, costCents: 200 },
      { key: "c", label: "C", revenueCents: 1000, costCents: 900 },
    ]);
    expect(rows.map((row) => row.key)).toEqual(["b", "c", "a"]);
    expect(rows[0].marginCents).toBe(800);
    expect(rows[2].marginCents).toBe(-500);
  });
});

describe("cashFlowByDay", () => {
  it("agrega entradas e saidas por dia", () => {
    const days = cashFlowByDay([
      { dateKey: "2026-06-02", direction: "debit", amountCents: 5000 },
      { dateKey: "2026-06-01", direction: "credit", amountCents: 2000 },
      { dateKey: "2026-06-01", direction: "debit", amountCents: 3000 },
    ]);
    expect(days.map((day) => day.dateKey)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(days[0]).toEqual({
      dateKey: "2026-06-01",
      inflowCents: 3000,
      outflowCents: 2000,
      netCents: 1000,
    });
    expect(days[1].netCents).toBe(5000);
  });
});
