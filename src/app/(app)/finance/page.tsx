import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  chargeItems,
  charges,
  journalEntries,
  journalLines,
  ledgerAccounts,
  memberships,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { AccountManager } from "./account-manager";
import { ChargeList } from "./charge-list";
import { JournalForm } from "./journal-form";
import { JournalList } from "./journal-list";
import type { Charge, JournalEntry, LedgerAccount } from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager", "staff"];

export default async function FinancePage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar o financeiro.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const accountRows = await tx
      .select({
        id: ledgerAccounts.id,
        code: ledgerAccounts.code,
        name: ledgerAccounts.name,
        type: ledgerAccounts.type,
        isActive: ledgerAccounts.isActive,
      })
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.tenantId, tenant.id))
      .orderBy(asc(ledgerAccounts.code));

    const lineRows = await tx
      .select({
        accountId: journalLines.accountId,
        direction: journalLines.direction,
        amountCents: journalLines.amountCents,
      })
      .from(journalLines)
      .where(eq(journalLines.tenantId, tenant.id));

    const entryRows = await tx
      .select({
        id: journalEntries.id,
        occurredAt: journalEntries.occurredAt,
        description: journalEntries.description,
      })
      .from(journalEntries)
      .where(eq(journalEntries.tenantId, tenant.id))
      .orderBy(desc(journalEntries.occurredAt), desc(journalEntries.createdAt))
      .limit(20);

    const entryIds = entryRows.map((row) => row.id);
    const entryLines = entryIds.length
      ? await tx
          .select({
            id: journalLines.id,
            entryId: journalLines.entryId,
            accountId: journalLines.accountId,
            direction: journalLines.direction,
            amountCents: journalLines.amountCents,
          })
          .from(journalLines)
          .where(inArray(journalLines.entryId, entryIds))
      : [];

    const chargeRows = await tx
      .select({
        id: charges.id,
        status: charges.status,
        totalCents: charges.totalCents,
      })
      .from(charges)
      .where(eq(charges.tenantId, tenant.id))
      .orderBy(desc(charges.createdAt))
      .limit(30);

    const chargeIds = chargeRows.map((row) => row.id);
    const chargeItemRows = chargeIds.length
      ? await tx
          .select({ chargeId: chargeItems.chargeId, description: chargeItems.description })
          .from(chargeItems)
          .where(inArray(chargeItems.chargeId, chargeIds))
      : [];

    const [membership] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenant.id),
          eq(memberships.userId, userId),
        ),
      )
      .limit(1);

    return {
      accounts: accountRows as LedgerAccount[],
      lineRows,
      entryRows,
      entryLines,
      chargeRows,
      chargeItemRows,
      canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
    };
  });

  const balances: Record<string, { debitCents: number; creditCents: number }> = {};
  for (const line of data.lineRows) {
    const bucket = (balances[line.accountId] ??= {
      debitCents: 0,
      creditCents: 0,
    });
    if (line.direction === "debit") bucket.debitCents += line.amountCents;
    else bucket.creditCents += line.amountCents;
  }

  const accountById = new Map(data.accounts.map((account) => [account.id, account]));
  const linesByEntry = new Map<string, JournalEntry["lines"]>();
  for (const line of data.entryLines) {
    const account = accountById.get(line.accountId);
    const list = linesByEntry.get(line.entryId) ?? [];
    list.push({
      id: line.id,
      accountId: line.accountId,
      accountCode: account?.code ?? "—",
      accountName: account?.name ?? "—",
      direction: line.direction,
      amountCents: line.amountCents,
    });
    linesByEntry.set(line.entryId, list);
  }

  const entries: JournalEntry[] = data.entryRows.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    description: row.description,
    lines: linesByEntry.get(row.id) ?? [],
  }));

  const itemByCharge = new Map<string, string>();
  for (const item of data.chargeItemRows) {
    if (!itemByCharge.has(item.chargeId)) {
      itemByCharge.set(item.chargeId, item.description);
    }
  }
  const chargeList: Charge[] = data.chargeRows.map((row) => ({
    id: row.id,
    description: itemByCharge.get(row.id) ?? "Cobrança",
    totalCents: row.totalCents,
    status: row.status,
  }));

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Financeiro</p>
        <h1 className="mt-2 text-2xl font-semibold">Livro-razão</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Partidas dobradas de {tenant.name}. Lançamentos são imutáveis
          (append-only); correções são feitas por lançamento reverso.
        </p>
      </header>

      <AccountManager
        accounts={data.accounts}
        balances={balances}
        canManage={data.canManage}
      />

      {data.canManage && data.accounts.length >= 2 && (
        <JournalForm
          accounts={data.accounts.filter((account) => account.isActive)}
        />
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Cobranças
        </h2>
        <div className="mt-4">
          <ChargeList charges={chargeList} canSettle={data.canManage} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Lançamentos recentes
        </h2>
        <div className="mt-4">
          <JournalList entries={entries} />
        </div>
      </section>
    </div>
  );
}
