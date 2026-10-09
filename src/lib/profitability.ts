export type DreAccountRow = {
  type: string;
  systemKey: string | null;
  net: number;
};

export type Dre = {
  revenue: number;
  deductions: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
};

const DEDUCTION_KEYS = new Set(["expense_discount"]);
const COGS_KEYS = new Set(["expense_cogs"]);

/**
 * DRE simplificado a partir do balancete (movimento do periodo).
 * Receita - deducoes - CMV = lucro bruto; lucro bruto - despesas = lucro liquido.
 * `net` ja vem normalizado pelo tipo (receita = credito - debito; despesa =
 * debito - credito). Logica pura (testavel).
 */
export function computeDre(rows: DreAccountRow[]): Dre {
  let revenue = 0;
  let deductions = 0;
  let cogs = 0;
  let operatingExpenses = 0;

  for (const row of rows) {
    if (row.type === "revenue") {
      revenue += row.net;
      continue;
    }
    if (row.type !== "expense") continue;
    if (row.systemKey && DEDUCTION_KEYS.has(row.systemKey)) {
      deductions += row.net;
    } else if (row.systemKey && COGS_KEYS.has(row.systemKey)) {
      cogs += row.net;
    } else {
      operatingExpenses += row.net;
    }
  }

  const grossProfit = revenue - deductions - cogs;
  return {
    revenue,
    deductions,
    cogs,
    grossProfit,
    operatingExpenses,
    netProfit: grossProfit - operatingExpenses,
  };
}

export function marginCents(revenueCents: number, costCents: number): number {
  return revenueCents - costCents;
}

/** Margem percentual com uma casa decimal (0 quando nao ha receita). */
export function marginPercent(
  revenueCents: number,
  costCents: number,
): number {
  if (revenueCents <= 0) return 0;
  return (
    Math.round(((revenueCents - costCents) / revenueCents) * 1000) / 10
  );
}

export type ProfitabilityInput = {
  key: string;
  label: string;
  revenueCents: number;
  costCents: number;
};

export type ProfitabilityRow = ProfitabilityInput & {
  marginCents: number;
  marginPercent: number;
};

/** Calcula margem e ordena do maior lucro para o maior prejuizo. */
export function rankProfitability(
  rows: ProfitabilityInput[],
): ProfitabilityRow[] {
  return rows
    .map((row) => ({
      ...row,
      marginCents: marginCents(row.revenueCents, row.costCents),
      marginPercent: marginPercent(row.revenueCents, row.costCents),
    }))
    .sort((a, b) => b.marginCents - a.marginCents);
}

export type CashFlowEntry = {
  dateKey: string;
  direction: "debit" | "credit";
  amountCents: number;
};

export type CashFlowDay = {
  dateKey: string;
  inflowCents: number;
  outflowCents: number;
  netCents: number;
};

/**
 * Fluxo de caixa (realizado) por dia: debitos em Caixa/Banco = entradas;
 * creditos = saidas. Diferente do resultado por competencia (DRE).
 */
export function cashFlowByDay(entries: CashFlowEntry[]): CashFlowDay[] {
  const byDay = new Map<string, { inflowCents: number; outflowCents: number }>();
  for (const entry of entries) {
    const bucket = byDay.get(entry.dateKey) ?? {
      inflowCents: 0,
      outflowCents: 0,
    };
    if (entry.direction === "debit") bucket.inflowCents += entry.amountCents;
    else bucket.outflowCents += entry.amountCents;
    byDay.set(entry.dateKey, bucket);
  }
  return [...byDay.entries()]
    .map(([dateKey, value]) => ({
      dateKey,
      inflowCents: value.inflowCents,
      outflowCents: value.outflowCents,
      netCents: value.inflowCents - value.outflowCents,
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
