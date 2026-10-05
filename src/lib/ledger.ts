import { and, eq, sql } from "drizzle-orm";
import {
  accountingPeriods,
  journalEntries,
  journalLines,
  ledgerAccounts,
} from "@/db/schema";
import type { AppTx } from "@/lib/db";

export type LedgerLineInput = {
  accountId: string;
  direction: "debit" | "credit";
  amountCents: number;
};

export async function getSystemAccountId(
  tx: AppTx,
  tenantId: string,
  systemKey: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(
      and(
        eq(ledgerAccounts.tenantId, tenantId),
        eq(ledgerAccounts.systemKey, systemKey),
        eq(ledgerAccounts.isActive, true),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export async function postEntry(
  tx: AppTx,
  params: {
    tenantId: string;
    userId: string;
    description: string;
    idempotencyKey: string;
    lines: LedgerLineInput[];
    referenceType?: string | null;
    referenceId?: string | null;
    occurredAt?: Date;
    reversesEntryId?: string | null;
  },
): Promise<string> {
  const occurredAt = params.occurredAt ?? new Date();

  const [closedPeriod] = await tx
    .select({ id: accountingPeriods.id })
    .from(accountingPeriods)
    .where(
      and(
        eq(accountingPeriods.tenantId, params.tenantId),
        eq(accountingPeriods.status, "closed"),
        sql`(${occurredAt} at time zone 'UTC')::date between ${accountingPeriods.periodStart} and ${accountingPeriods.periodEnd}`,
      ),
    )
    .limit(1);
  if (closedPeriod) {
    throw new Error("accounting_period_closed");
  }

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      tenantId: params.tenantId,
      occurredAt,
      description: params.description,
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
      idempotencyKey: params.idempotencyKey,
      reversesEntryId: params.reversesEntryId ?? null,
      createdBy: params.userId,
    })
    .returning({ id: journalEntries.id });

  await tx.insert(journalLines).values(
    params.lines.map((line) => ({
      tenantId: params.tenantId,
      entryId: entry.id,
      accountId: line.accountId,
      direction: line.direction,
      amountCents: line.amountCents,
    })),
  );

  return entry.id;
}
