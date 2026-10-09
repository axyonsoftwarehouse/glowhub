import { and, asc, eq, gte, lte } from "drizzle-orm";
import { journalEntries, journalLines, ledgerAccounts } from "@/db/schema";
import type { AppTx } from "@/lib/db";

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  systemKey: string | null;
  debit: number;
  credit: number;
  net: number;
};

/**
 * Balancete (movimento) por conta no periodo [from, to] (inclusive).
 * `net` e normalizado pelo tipo: receita/passivo/patrimonio = credito - debito;
 * ativo/despesa = debito - credito.
 */
export async function computeTrialBalance(
  tx: AppTx,
  tenantId: string,
  from: Date,
  to: Date,
): Promise<TrialBalanceRow[]> {
  const accounts = await tx
    .select({
      id: ledgerAccounts.id,
      code: ledgerAccounts.code,
      name: ledgerAccounts.name,
      type: ledgerAccounts.type,
      systemKey: ledgerAccounts.systemKey,
    })
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.tenantId, tenantId))
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
        eq(journalLines.tenantId, tenantId),
        gte(journalEntries.occurredAt, from),
        lte(journalEntries.occurredAt, to),
      ),
    );

  const balanceByAccount = new Map<string, { debit: number; credit: number }>();
  for (const line of lines) {
    const bucket = balanceByAccount.get(line.accountId) ?? {
      debit: 0,
      credit: 0,
    };
    if (line.direction === "debit") bucket.debit += line.amountCents;
    else bucket.credit += line.amountCents;
    balanceByAccount.set(line.accountId, bucket);
  }

  return accounts
    .map((account) => {
      const balance = balanceByAccount.get(account.id) ?? { debit: 0, credit: 0 };
      const net =
        account.type === "revenue" ||
        account.type === "liability" ||
        account.type === "equity"
          ? balance.credit - balance.debit
          : balance.debit - balance.credit;
      return {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        systemKey: account.systemKey ?? null,
        debit: balance.debit,
        credit: balance.credit,
        net,
      };
    })
    .filter((row) => row.debit !== 0 || row.credit !== 0);
}

export function summarizeTrialBalance(rows: TrialBalanceRow[]): {
  revenue: number;
  expense: number;
  result: number;
} {
  const revenue = rows
    .filter((row) => row.type === "revenue")
    .reduce((sum, row) => sum + row.net, 0);
  const expense = rows
    .filter((row) => row.type === "expense")
    .reduce((sum, row) => sum + row.net, 0);
  return { revenue, expense, result: revenue - expense };
}
