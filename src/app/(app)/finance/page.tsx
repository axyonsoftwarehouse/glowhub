import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  chargeItems,
  charges,
  earnings,
  journalEntries,
  journalLines,
  ledgerAccounts,
  memberships,
  payments,
  productVariants,
  products,
  professionals,
} from "@/db/schema";
import { formatCentsBRL } from "@/lib/money";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { AccountManager } from "./account-manager";
import { ChargeList } from "./charge-list";
import { JournalForm } from "./journal-form";
import { JournalList } from "./journal-list";
import { PayoutList } from "./payout-list";
import type {
  Charge,
  ChargeItem,
  JournalEntry,
  LedgerAccount,
  ProductOption,
} from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager", "staff"];

const METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  pix: "Pix",
  transfer: "Transferência",
  wallet: "Carteira",
  other: "Outro",
};

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
          .select({
            id: chargeItems.id,
            chargeId: chargeItems.chargeId,
            kind: chargeItems.kind,
            description: chargeItems.description,
            quantity: chargeItems.quantity,
            unitPriceCents: chargeItems.unitPriceCents,
            totalCents: chargeItems.totalCents,
          })
          .from(chargeItems)
          .where(inArray(chargeItems.chargeId, chargeIds))
      : [];

    const productRows = await tx
      .select({
        variantId: productVariants.id,
        productName: products.name,
        variantName: productVariants.name,
        priceCents: productVariants.priceCents,
        stockQuantity: productVariants.stockQuantity,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(productVariants.tenantId, tenant.id),
          eq(productVariants.isActive, true),
          eq(products.kind, "resale"),
        ),
      )
      .orderBy(asc(products.name), asc(productVariants.name));

    const paymentRows = await tx
      .select({
        id: payments.id,
        chargeId: payments.chargeId,
        method: payments.method,
        amountCents: payments.amountCents,
        status: payments.status,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(eq(payments.tenantId, tenant.id))
      .orderBy(desc(payments.createdAt))
      .limit(30);

    const earningRows = await tx
      .select({
        professionalId: earnings.professionalId,
        kind: earnings.kind,
        amountCents: earnings.amountCents,
      })
      .from(earnings)
      .where(
        and(eq(earnings.tenantId, tenant.id), eq(earnings.status, "pending")),
      );

    const professionalRows = await tx
      .select({ id: professionals.id, name: professionals.name })
      .from(professionals)
      .where(eq(professionals.tenantId, tenant.id));

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
      productRows,
      paymentRows,
      earningRows,
      professionalRows,
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
  const itemsByCharge = new Map<string, ChargeItem[]>();
  for (const item of data.chargeItemRows) {
    if (!itemByCharge.has(item.chargeId)) {
      itemByCharge.set(item.chargeId, item.description);
    }
    const list = itemsByCharge.get(item.chargeId) ?? [];
    list.push({
      id: item.id,
      kind: item.kind,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalCents: item.totalCents,
    });
    itemsByCharge.set(item.chargeId, list);
  }
  const paidByCharge = new Map<string, number>();
  for (const payment of data.paymentRows) {
    if (payment.status !== "confirmed") continue;
    paidByCharge.set(
      payment.chargeId,
      (paidByCharge.get(payment.chargeId) ?? 0) + payment.amountCents,
    );
  }

  const chargeList: Charge[] = data.chargeRows.map((row) => ({
    id: row.id,
    description: itemByCharge.get(row.id) ?? "Cobrança",
    totalCents: row.totalCents,
    paidCents: paidByCharge.get(row.id) ?? 0,
    status: row.status,
    items: itemsByCharge.get(row.id) ?? [],
  }));

  const productOptions: ProductOption[] = data.productRows.map((row) => ({
    variantId: row.variantId,
    label: `${row.productName} · ${row.variantName}`,
    priceCents: row.priceCents,
    stockQuantity: row.stockQuantity,
  }));

  const paymentList = data.paymentRows.map((row) => ({
    id: row.id,
    method: row.method,
    amountCents: row.amountCents,
    status: row.status,
    chargeDescription: itemByCharge.get(row.chargeId) ?? "Cobrança",
    createdAt: row.createdAt.toISOString(),
  }));

  const professionalName = new Map(
    data.professionalRows.map((row) => [row.id, row.name]),
  );
  const payoutMap = new Map<string, { commissionCents: number; tipCents: number }>();
  for (const row of data.earningRows) {
    const bucket = payoutMap.get(row.professionalId) ?? {
      commissionCents: 0,
      tipCents: 0,
    };
    if (row.kind === "commission") bucket.commissionCents += row.amountCents;
    else bucket.tipCents += row.amountCents;
    payoutMap.set(row.professionalId, bucket);
  }
  const payoutRows = [...payoutMap.entries()].map(([professionalId, totals]) => ({
    professionalId,
    professionalName: professionalName.get(professionalId) ?? "Profissional",
    commissionCents: totals.commissionCents,
    tipCents: totals.tipCents,
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
          <ChargeList
            charges={chargeList}
            productOptions={productOptions}
            canSettle={data.canManage}
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Pagamentos
        </h2>
        <div className="mt-4 space-y-1">
          {paymentList.map((payment) => (
            <div
              key={payment.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white/60 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-foreground/70">
                {payment.chargeDescription}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-foreground/70">
                  {METHOD_LABELS[payment.method] ?? payment.method}
                </span>
                <span className="font-medium">
                  {formatCentsBRL(payment.amountCents)}
                </span>
              </span>
            </div>
          ))}
          {paymentList.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum pagamento registrado.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Repasses (comissão + gorjeta)
        </h2>
        <div className="mt-4">
          <PayoutList rows={payoutRows} />
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
