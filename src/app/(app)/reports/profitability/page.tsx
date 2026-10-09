import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import {
  chargeItems,
  charges,
  journalEntries,
  journalLines,
  productVariants,
  products,
  services,
  stockMovements,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { computeTrialBalance } from "@/lib/accounting";
import {
  cashFlowByDay,
  computeDre,
  rankProfitability,
  type CashFlowEntry,
  type ProfitabilityInput,
} from "@/lib/profitability";
import { formatCentsBRL } from "@/lib/money";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { zonedDateKey } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function monthStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export default async function ProfitabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para ver a lucratividade.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const from = first(sp.from) ?? monthStart();
  const to = first(sp.to) ?? today;
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T23:59:59Z`);

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const trialRows = await computeTrialBalance(tx, tenant.id, start, end);

    const itemRows = await tx
      .select({
        id: chargeItems.id,
        kind: chargeItems.kind,
        referenceId: chargeItems.referenceId,
        description: chargeItems.description,
        totalCents: chargeItems.totalCents,
      })
      .from(chargeItems)
      .innerJoin(charges, eq(charges.id, chargeItems.chargeId))
      .where(
        and(
          eq(chargeItems.tenantId, tenant.id),
          ne(charges.status, "void"),
          gte(charges.createdAt, start),
          lte(charges.createdAt, end),
        ),
      );

    const itemIds = itemRows.map((row) => row.id);
    const movementRows = itemIds.length
      ? await tx
          .select({
            referenceId: stockMovements.referenceId,
            quantityDelta: stockMovements.quantityDelta,
            unitCostCents: stockMovements.unitCostCents,
          })
          .from(stockMovements)
          .where(
            and(
              eq(stockMovements.tenantId, tenant.id),
              eq(stockMovements.referenceType, "charge_item"),
              inArray(stockMovements.referenceId, itemIds),
            ),
          )
      : [];

    const cashAccounts = trialRows
      .filter(
        (row) => row.systemKey === "cash" || row.systemKey === "bank",
      )
      .map((row) => row.accountId);

    const cashLines = cashAccounts.length
      ? await tx
          .select({
            direction: journalLines.direction,
            amountCents: journalLines.amountCents,
            occurredAt: journalEntries.occurredAt,
          })
          .from(journalLines)
          .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
          .where(
            and(
              eq(journalLines.tenantId, tenant.id),
              inArray(journalLines.accountId, cashAccounts),
              gte(journalEntries.occurredAt, start),
              lte(journalEntries.occurredAt, end),
            ),
          )
      : [];

    const serviceIds = [
      ...new Set(
        itemRows
          .filter((row) => row.kind === "service" && row.referenceId)
          .map((row) => row.referenceId as string),
      ),
    ];
    const serviceRows = serviceIds.length
      ? await tx
          .select({ id: services.id, name: services.name })
          .from(services)
          .where(inArray(services.id, serviceIds))
      : [];

    const variantIds = [
      ...new Set(
        itemRows
          .filter((row) => row.kind === "product" && row.referenceId)
          .map((row) => row.referenceId as string),
      ),
    ];
    const variantRows = variantIds.length
      ? await tx
          .select({
            id: productVariants.id,
            productName: products.name,
            variantName: productVariants.name,
          })
          .from(productVariants)
          .innerJoin(products, eq(products.id, productVariants.productId))
          .where(inArray(productVariants.id, variantIds))
      : [];

    return {
      trialRows,
      itemRows,
      movementRows,
      cashLines,
      serviceRows,
      variantRows,
    };
  });

  const dre = computeDre(data.trialRows);

  const costByItem = new Map<string, number>();
  for (const movement of data.movementRows) {
    if (!movement.referenceId) continue;
    const cost = -movement.quantityDelta * movement.unitCostCents;
    costByItem.set(
      movement.referenceId,
      (costByItem.get(movement.referenceId) ?? 0) + cost,
    );
  }

  const serviceAgg = new Map<string, { revenue: number; cost: number }>();
  const productAgg = new Map<string, { revenue: number; cost: number }>();
  for (const item of data.itemRows) {
    if (!item.referenceId) continue;
    const target =
      item.kind === "service"
        ? serviceAgg
        : item.kind === "product"
          ? productAgg
          : null;
    if (!target) continue;
    const bucket = target.get(item.referenceId) ?? { revenue: 0, cost: 0 };
    bucket.revenue += item.totalCents;
    bucket.cost += costByItem.get(item.id) ?? 0;
    target.set(item.referenceId, bucket);
  }

  const serviceName = new Map(data.serviceRows.map((row) => [row.id, row.name]));
  const variantName = new Map(
    data.variantRows.map((row) => [
      row.id,
      `${row.productName} · ${row.variantName}`,
    ]),
  );

  const serviceProfits = rankProfitability(
    [...serviceAgg.entries()].map(
      ([id, totals]): ProfitabilityInput => ({
        key: id,
        label: serviceName.get(id) ?? "Serviço",
        revenueCents: totals.revenue,
        costCents: totals.cost,
      }),
    ),
  );
  const productProfits = rankProfitability(
    [...productAgg.entries()].map(
      ([id, totals]): ProfitabilityInput => ({
        key: id,
        label: variantName.get(id) ?? "Produto",
        revenueCents: totals.revenue,
        costCents: totals.cost,
      }),
    ),
  );

  const cashEntries: CashFlowEntry[] = data.cashLines.map((line) => ({
    dateKey: zonedDateKey(line.occurredAt.toISOString(), TZ),
    direction: line.direction,
    amountCents: line.amountCents,
  }));
  const cashDays = cashFlowByDay(cashEntries);
  const cashInflow = cashDays.reduce((sum, day) => sum + day.inflowCents, 0);
  const cashOutflow = cashDays.reduce((sum, day) => sum + day.outflowCents, 0);
  const cashNet = cashInflow - cashOutflow;

  const dreRows = [
    { label: "Receita bruta", value: dre.revenue, strong: true },
    { label: "(-) Deduções (descontos)", value: -dre.deductions },
    { label: "(-) CMV (custo de produtos/serviços)", value: -dre.cogs },
    { label: "= Lucro bruto", value: dre.grossProfit, strong: true },
    { label: "(-) Despesas operacionais", value: -dre.operatingExpenses },
    { label: "= Lucro líquido", value: dre.netProfit, strong: true },
  ];

  const renderProfitTable = (title: string, rows: typeof serviceProfits) => (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
        {title}
      </h2>
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-foreground/70">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Receita</th>
              <th className="px-3 py-2 text-right">Custo (CMV)</th>
              <th className="px-3 py-2 text-right">Margem</th>
              <th className="px-3 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-border">
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2 text-right">
                  {formatCentsBRL(row.revenueCents)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatCentsBRL(row.costCents)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-medium ${
                    row.marginCents >= 0 ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {formatCentsBRL(row.marginCents)}
                </td>
                <td
                  className={`px-3 py-2 text-right ${
                    row.marginPercent >= 0 ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {row.marginPercent}%
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-sm text-foreground/60">
                  Sem dados no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">
          Análise
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Lucratividade & DRE</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Período de {from} a {to} · {tenant.name}
        </p>
      </header>

      <form method="get" action="/reports/profitability" className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-foreground/60">De</label>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="mt-1 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/60">Até</label>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="mt-1 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <button
          type="submit"
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Aplicar
        </button>
      </form>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Receita bruta", value: dre.revenue },
          { label: "Lucro bruto", value: dre.grossProfit },
          { label: "Lucro líquido (competência)", value: dre.netProfit },
          { label: "Caixa realizado (entradas - saídas)", value: cashNet },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-border bg-white/70 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-foreground/70">
              {card.label}
            </p>
            <p className="mt-1 text-lg font-semibold">
              {formatCentsBRL(card.value)}
            </p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          DRE do período
        </h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <tbody>
              {dreRows.map((row) => (
                <tr key={row.label} className="border-t border-border">
                  <td className={`px-3 py-2 ${row.strong ? "font-medium" : ""}`}>
                    {row.label}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCentsBRL(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {renderProfitTable("Lucratividade por serviço", serviceProfits)}
      {renderProfitTable("Lucratividade por produto", productProfits)}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Fluxo de caixa (realizado)
        </h2>
        <p className="mt-1 text-xs text-foreground/60">
          Entradas {formatCentsBRL(cashInflow)} · saídas{" "}
          {formatCentsBRL(cashOutflow)} · líquido {formatCentsBRL(cashNet)}. Difere
          do resultado por competência (DRE), que inclui valores a receber/pagar.
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-foreground/70">
              <tr>
                <th className="px-3 py-2">Dia</th>
                <th className="px-3 py-2 text-right">Entradas</th>
                <th className="px-3 py-2 text-right">Saídas</th>
                <th className="px-3 py-2 text-right">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {cashDays.map((day) => (
                <tr key={day.dateKey} className="border-t border-border">
                  <td className="px-3 py-2">{day.dateKey}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">
                    {formatCentsBRL(day.inflowCents)}
                  </td>
                  <td className="px-3 py-2 text-right text-red-600">
                    {formatCentsBRL(day.outflowCents)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCentsBRL(day.netCents)}
                  </td>
                </tr>
              ))}
              {cashDays.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-sm text-foreground/60">
                    Sem movimentação de caixa no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
