import { and, asc, eq, gte, lte } from "drizzle-orm";
import {
  charges,
  earnings,
  journalEntries,
  journalLines,
  ledgerAccounts,
  payments,
  professionals,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { formatCentsBRL } from "@/lib/money";
import { zonedDateKey } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  asset: "Ativo",
  liability: "Passivo",
  equity: "Patrimônio",
  revenue: "Receita",
  expense: "Despesa",
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  pix: "Pix",
  transfer: "Transferência",
  wallet: "Carteira",
  other: "Outro",
};

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function monthStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export default async function ReportsPage({
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
          Selecione ou configure um tenant para ver os relatórios.
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
    const accounts = await tx
      .select({
        id: ledgerAccounts.id,
        code: ledgerAccounts.code,
        name: ledgerAccounts.name,
        type: ledgerAccounts.type,
      })
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.tenantId, tenant.id))
      .orderBy(asc(ledgerAccounts.code));

    const lines = await tx
      .select({
        accountId: journalLines.accountId,
        direction: journalLines.direction,
        amountCents: journalLines.amountCents,
        occurredAt: journalEntries.occurredAt,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.tenantId, tenant.id),
          gte(journalEntries.occurredAt, start),
          lte(journalEntries.occurredAt, end),
        ),
      );

    const received = await tx
      .select({
        amountCents: payments.amountCents,
        status: payments.status,
        method: payments.method,
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenant.id),
          gte(payments.createdAt, start),
          lte(payments.createdAt, end),
        ),
      );

    const chargeRows = await tx
      .select({
        id: charges.id,
        status: charges.status,
        totalCents: charges.totalCents,
      })
      .from(charges)
      .where(eq(charges.tenantId, tenant.id));

    const paidRows = await tx
      .select({ chargeId: payments.chargeId, amountCents: payments.amountCents })
      .from(payments)
      .where(
        and(eq(payments.tenantId, tenant.id), eq(payments.status, "confirmed")),
      );

    const earningRows = await tx
      .select({
        professionalId: earnings.professionalId,
        kind: earnings.kind,
        amountCents: earnings.amountCents,
      })
      .from(earnings)
      .where(
        and(
          eq(earnings.tenantId, tenant.id),
          gte(earnings.createdAt, start),
          lte(earnings.createdAt, end),
        ),
      );

    const professionalRows = await tx
      .select({ id: professionals.id, name: professionals.name })
      .from(professionals)
      .where(eq(professionals.tenantId, tenant.id));

    return {
      accounts,
      lines,
      received,
      chargeRows,
      paidRows,
      earningRows,
      professionalRows,
    };
  });

  const balanceByAccount = new Map<string, { debit: number; credit: number }>();
  for (const line of data.lines) {
    const bucket = balanceByAccount.get(line.accountId) ?? { debit: 0, credit: 0 };
    if (line.direction === "debit") bucket.debit += line.amountCents;
    else bucket.credit += line.amountCents;
    balanceByAccount.set(line.accountId, bucket);
  }

  const trialRows = data.accounts
    .map((account) => {
      const balance = balanceByAccount.get(account.id) ?? { debit: 0, credit: 0 };
      const net =
        account.type === "revenue" ||
        account.type === "liability" ||
        account.type === "equity"
          ? balance.credit - balance.debit
          : balance.debit - balance.credit;
      return { ...account, ...balance, net };
    })
    .filter((row) => row.debit !== 0 || row.credit !== 0);

  const revenueTotal = trialRows
    .filter((row) => row.type === "revenue")
    .reduce((sum, row) => sum + row.net, 0);
  const expenseTotal = trialRows
    .filter((row) => row.type === "expense")
    .reduce((sum, row) => sum + row.net, 0);
  const result = revenueTotal - expenseTotal;

  const receivedTotal = data.received
    .filter((row) => row.status === "confirmed")
    .reduce((sum, row) => sum + row.amountCents, 0);

  // receita por dia (para grafico)
  const accountTypeById = new Map(
    data.accounts.map((account) => [account.id, account.type]),
  );
  const revenueByDay = new Map<string, number>();
  for (const line of data.lines) {
    if (accountTypeById.get(line.accountId) !== "revenue") continue;
    if (line.direction !== "credit") continue;
    const key = zonedDateKey(line.occurredAt.toISOString(), "America/Sao_Paulo");
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + line.amountCents);
  }
  const dayCount = Math.min(
    62,
    Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1),
  );
  const dailyRevenue = Array.from({ length: dayCount }, (_, i) => {
    const date = addDays(from, i);
    return { date, value: revenueByDay.get(date) ?? 0 };
  });
  const maxDaily = Math.max(1, ...dailyRevenue.map((d) => d.value));

  // recebimentos por forma de pagamento
  const methodTotals = new Map<string, number>();
  for (const row of data.received) {
    if (row.status !== "confirmed") continue;
    methodTotals.set(row.method, (methodTotals.get(row.method) ?? 0) + row.amountCents);
  }
  const methodRows = [...methodTotals.entries()].sort((a, b) => b[1] - a[1]);
  const maxMethod = Math.max(1, ...methodRows.map(([, v]) => v));

  const paidByCharge = new Map<string, number>();
  for (const row of data.paidRows) {
    paidByCharge.set(row.chargeId, (paidByCharge.get(row.chargeId) ?? 0) + row.amountCents);
  }
  const openTotal = data.chargeRows
    .filter((row) => row.status === "open")
    .reduce(
      (sum, row) => sum + Math.max(0, row.totalCents - (paidByCharge.get(row.id) ?? 0)),
      0,
    );

  const professionalName = new Map(
    data.professionalRows.map((row) => [row.id, row.name]),
  );
  const earningByProfessional = new Map<string, { commission: number; tip: number }>();
  for (const row of data.earningRows) {
    const bucket = earningByProfessional.get(row.professionalId) ?? {
      commission: 0,
      tip: 0,
    };
    if (row.kind === "commission") bucket.commission += row.amountCents;
    else bucket.tip += row.amountCents;
    earningByProfessional.set(row.professionalId, bucket);
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Análise</p>
        <h1 className="mt-2 text-2xl font-semibold">Relatórios</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Período de {from} a {to} · {tenant.name}
        </p>
      </header>

      <form method="get" action="/reports" className="flex flex-wrap items-end gap-3">
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
          { label: "Receitas", value: revenueTotal },
          { label: "Despesas", value: expenseTotal },
          { label: "Resultado", value: result },
          { label: "Recebido no período", value: receivedTotal },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-border bg-white/70 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-foreground/50">
              {card.label}
            </p>
            <p className="mt-1 text-lg font-semibold">{formatCentsBRL(card.value)}</p>
          </div>
        ))}
      </section>

      <p className="text-sm text-foreground/60">
        A receber (cobranças abertas): <strong>{formatCentsBRL(openTotal)}</strong>
      </p>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Receita por dia
        </h2>
        <div className="mt-4 flex h-40 items-end gap-[2px]">
          {dailyRevenue.map((day) => (
            <div
              key={day.date}
              className="flex flex-1 flex-col items-center justify-end"
              title={`${day.date}: ${formatCentsBRL(day.value)}`}
            >
              <div
                className="w-full rounded-t bg-brand/80"
                style={{
                  height: `${Math.round((day.value / maxDaily) * 100)}%`,
                  minHeight: day.value > 0 ? 2 : 0,
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-foreground/40">
          <span>{dailyRevenue[0]?.date}</span>
          <span>{dailyRevenue.at(-1)?.date}</span>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Recebimentos por forma de pagamento
        </h2>
        <div className="mt-4 space-y-2">
          {methodRows.map(([method, value]) => (
            <div key={method} className="flex items-center gap-3">
              <span className="w-28 text-xs text-foreground/60">
                {METHOD_LABELS[method] ?? method}
              </span>
              <div className="h-2 flex-1 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-brand"
                  style={{ width: `${Math.round((value / maxMethod) * 100)}%` }}
                />
              </div>
              <span className="w-24 text-right text-xs font-medium">
                {formatCentsBRL(value)}
              </span>
            </div>
          ))}
          {methodRows.length === 0 && (
            <p className="text-sm text-foreground/60">
              Sem recebimentos no período.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Balancete (movimento no período)
        </h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-foreground/50">
              <tr>
                <th className="px-3 py-2">Conta</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2 text-right">Débito</th>
                <th className="px-3 py-2 text-right">Crédito</th>
                <th className="px-3 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {trialRows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-foreground/50">
                      {row.code}
                    </span>{" "}
                    {row.name}
                  </td>
                  <td className="px-3 py-2 text-foreground/60">
                    {TYPE_LABELS[row.type] ?? row.type}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCentsBRL(row.debit)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCentsBRL(row.credit)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCentsBRL(row.net)}
                  </td>
                </tr>
              ))}
              {trialRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-sm text-foreground/60">
                    Sem movimentação no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Comissões e gorjetas no período
        </h2>
        <div className="mt-4 space-y-1">
          {[...earningByProfessional.entries()].map(([professionalId, totals]) => (
            <div
              key={professionalId}
              className="flex items-center justify-between rounded-lg border border-border bg-white/60 px-3 py-2 text-sm"
            >
              <span>{professionalName.get(professionalId) ?? "Profissional"}</span>
              <span className="flex gap-4">
                <span className="text-xs text-foreground/50">
                  comissão {formatCentsBRL(totals.commission)}
                </span>
                <span className="text-xs text-foreground/50">
                  gorjeta {formatCentsBRL(totals.tip)}
                </span>
                <span className="font-medium">
                  {formatCentsBRL(totals.commission + totals.tip)}
                </span>
              </span>
            </div>
          ))}
          {earningByProfessional.size === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhuma comissão ou gorjeta no período.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
