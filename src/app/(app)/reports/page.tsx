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

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  asset: "Ativo",
  liability: "Passivo",
  equity: "Patrimônio",
  revenue: "Receita",
  expense: "Despesa",
};

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
      .select({ amountCents: payments.amountCents, status: payments.status })
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
