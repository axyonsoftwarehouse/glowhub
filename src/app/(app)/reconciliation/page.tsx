import { and, desc, eq, inArray } from "drizzle-orm";
import {
  chargeItems,
  charges,
  clients,
  memberships,
  payments,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { formatCentsBRL } from "@/lib/money";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { PendingPayments } from "./pending-payments";
import type { ChargeRow, PaymentRow } from "./types";

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

const CHARGE_STATUS: Record<ChargeRow["status"], string> = {
  open: "Aberta",
  paid: "Paga",
  void: "Estornada",
};

export default async function ReconciliationPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para conciliar.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const chargeRows = await tx
      .select({
        id: charges.id,
        totalCents: charges.totalCents,
        status: charges.status,
        clientId: charges.clientId,
        createdAt: charges.createdAt,
      })
      .from(charges)
      .where(eq(charges.tenantId, tenant.id))
      .orderBy(desc(charges.createdAt))
      .limit(60);

    const chargeIds = chargeRows.map((row) => row.id);
    const itemRows = chargeIds.length
      ? await tx
          .select({ chargeId: chargeItems.chargeId, description: chargeItems.description })
          .from(chargeItems)
          .where(inArray(chargeItems.chargeId, chargeIds))
      : [];

    const paymentRows = await tx
      .select({
        id: payments.id,
        chargeId: payments.chargeId,
        method: payments.method,
        amountCents: payments.amountCents,
        status: payments.status,
        provider: payments.provider,
        providerRef: payments.providerRef,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(eq(payments.tenantId, tenant.id))
      .orderBy(desc(payments.createdAt))
      .limit(100);

    const clientRows = await tx
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.tenantId, tenant.id));

    const [membership] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(eq(memberships.tenantId, tenant.id), eq(memberships.userId, userId)),
      )
      .limit(1);

    return {
      chargeRows,
      itemRows,
      paymentRows,
      clientRows,
      canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
    };
  });

  const descriptionByCharge = new Map<string, string>();
  for (const item of data.itemRows) {
    if (!descriptionByCharge.has(item.chargeId)) {
      descriptionByCharge.set(item.chargeId, item.description);
    }
  }
  const clientName = new Map(data.clientRows.map((row) => [row.id, row.name]));

  const paidByCharge = new Map<string, number>();
  const pendingByCharge = new Map<string, number>();
  for (const payment of data.paymentRows) {
    if (payment.status === "confirmed") {
      paidByCharge.set(
        payment.chargeId,
        (paidByCharge.get(payment.chargeId) ?? 0) + payment.amountCents,
      );
    } else if (payment.status === "pending") {
      pendingByCharge.set(
        payment.chargeId,
        (pendingByCharge.get(payment.chargeId) ?? 0) + payment.amountCents,
      );
    }
  }

  const chargeList: ChargeRow[] = data.chargeRows.map((row) => {
    const paid = paidByCharge.get(row.id) ?? 0;
    return {
      id: row.id,
      clientName: clientName.get(row.clientId ?? "") ?? "Sem cliente",
      description: descriptionByCharge.get(row.id) ?? "Cobrança",
      totalCents: row.totalCents,
      paidCents: paid,
      pendingCents: pendingByCharge.get(row.id) ?? 0,
      status: row.status,
      reconciled: row.status === "paid" && paid === row.totalCents,
    };
  });

  const paymentList: PaymentRow[] = data.paymentRows.map((row) => ({
    id: row.id,
    chargeDescription: descriptionByCharge.get(row.chargeId) ?? "Cobrança",
    method: row.method,
    amountCents: row.amountCents,
    status: row.status,
    provider: row.provider ?? null,
    providerRef: row.providerRef ?? null,
  }));

  const totalCharged = chargeList.reduce((sum, c) => sum + c.totalCents, 0);
  const totalReceived = paymentList
    .filter((p) => p.status === "confirmed")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const totalOpen = chargeList
    .filter((c) => c.status === "open")
    .reduce((sum, c) => sum + Math.max(0, c.totalCents - c.paidCents), 0);
  const pendingGateway = paymentList
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const pendingPayments = paymentList.filter((p) => p.status === "pending");
  const divergences = chargeList.filter(
    (c) => c.status === "paid" && !c.reconciled,
  ).length;

  const cards = [
    { label: "Cobrado", value: totalCharged },
    { label: "Recebido", value: totalReceived },
    { label: "Em aberto", value: totalOpen },
    { label: "Pendente (gateway)", value: pendingGateway },
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Financeiro</p>
        <h1 className="mt-2 text-2xl font-semibold">Conciliação</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Casar cobranças ↔ pagamentos ↔ gateway de {tenant.name}.
          {divergences > 0
            ? ` ${divergences} divergência(s) encontrada(s).`
            : " Sem divergências."}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-border bg-white/70 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-foreground/50">
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
          Pendências de conciliação
        </h2>
        <div className="mt-4">
          <PendingPayments payments={pendingPayments} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Cobranças
        </h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-foreground/50">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Pago</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {chargeList.map((charge) => {
                const remaining = charge.totalCents - charge.paidCents;
                const badge = charge.reconciled
                  ? { label: "Conciliado", cls: "bg-emerald-100 text-emerald-700" }
                  : charge.status === "paid"
                    ? { label: "Divergente", cls: "bg-red-100 text-red-700" }
                    : charge.paidCents > 0
                      ? { label: "Parcial", cls: "bg-amber-100 text-amber-700" }
                      : { label: CHARGE_STATUS[charge.status], cls: "bg-zinc-100 text-zinc-600" };
                return (
                  <tr key={charge.id} className="border-t border-border">
                    <td className="px-3 py-2">{charge.clientName}</td>
                    <td className="px-3 py-2 text-foreground/70">
                      {charge.description}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCentsBRL(charge.totalCents)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCentsBRL(charge.paidCents)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCentsBRL(Math.max(0, remaining))}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {chargeList.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-sm text-foreground/60">
                    Sem cobranças.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Pagamentos recebidos pelo gateway
        </h2>
        <div className="mt-4 space-y-1">
          {paymentList
            .filter((p) => p.provider)
            .map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between rounded-lg border border-border bg-white/60 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-foreground/70">
                  {payment.chargeDescription} · {payment.provider}{" "}
                  {payment.providerRef ? `(${payment.providerRef})` : ""}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-foreground/50">
                    {METHOD_LABELS[payment.method] ?? payment.method}
                  </span>
                  <span className="font-medium">
                    {formatCentsBRL(payment.amountCents)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      payment.status === "confirmed"
                        ? "bg-emerald-100 text-emerald-700"
                        : payment.status === "pending"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {payment.status}
                  </span>
                </span>
              </div>
            ))}
          {paymentList.filter((p) => p.provider).length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum pagamento via gateway ainda.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
