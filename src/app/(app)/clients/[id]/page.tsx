import Link from "next/link";
import { and, asc, desc, eq, inArray, sum } from "drizzle-orm";
import {
  appointments,
  branches,
  chargeItems,
  charges,
  clients,
  payments,
  professionals,
  services,
  walletTransactions,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import {
  averageTicketCents,
  classifyClient,
  CLIENT_SEGMENT_LABELS,
  daysBetween,
  frequencyDays,
  isVip,
  suggestedNextVisit,
  vipThresholdCents,
} from "@/lib/crm";
import { formatCentsBRL } from "@/lib/money";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { formatInTimeZone } from "@/lib/timezone";
import {
  STATUS_LABELS,
  type AppointmentStatus,
} from "@/app/(app)/appointments/types";

export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  check_in: "bg-indigo-100 text-indigo-700",
  checkout: "bg-purple-100 text-purple-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-zinc-100 text-zinc-600",
  no_show: "bg-red-100 text-red-700",
};

const CHARGE_LABELS: Record<string, string> = {
  open: "Aberta",
  paid: "Paga",
  void: "Cancelada",
};

const CHARGE_STYLES: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  void: "bg-zinc-100 text-zinc-600",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  failed: "Falhou",
  refunded: "Estornado",
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

const WALLET_KIND_LABELS: Record<string, string> = {
  topup: "Crédito",
  payment: "Débito",
  adjustment: "Ajuste",
};

function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function ClientHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para ver o histórico.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const [client] = await tx
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        phone: clients.phone,
        birthday: clients.birthday,
        tags: clients.tags,
        preferences: clients.preferences,
        marketingOptIn: clients.marketingOptIn,
        notes: clients.notes,
        isActive: clients.isActive,
      })
      .from(clients)
      .where(and(eq(clients.tenantId, tenant.id), eq(clients.id, id)))
      .limit(1);

    if (!client) return { client: null as null };

    const appointmentRows = await tx
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        priceCents: appointments.priceCents,
        branchTimezone: branches.timezone,
        branchName: branches.name,
        serviceName: services.name,
        professionalName: professionals.name,
      })
      .from(appointments)
      .leftJoin(branches, eq(branches.id, appointments.branchId))
      .leftJoin(services, eq(services.id, appointments.serviceId))
      .leftJoin(professionals, eq(professionals.id, appointments.professionalId))
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          eq(appointments.clientId, id),
        ),
      )
      .orderBy(desc(appointments.startsAt));

    const chargeRows = await tx
      .select({
        id: charges.id,
        status: charges.status,
        totalCents: charges.totalCents,
        createdAt: charges.createdAt,
      })
      .from(charges)
      .where(and(eq(charges.tenantId, tenant.id), eq(charges.clientId, id)))
      .orderBy(desc(charges.createdAt));

    const chargeIds = chargeRows.map((row) => row.id);

    const paymentRows = chargeIds.length
      ? await tx
          .select({
            id: payments.id,
            chargeId: payments.chargeId,
            method: payments.method,
            amountCents: payments.amountCents,
            status: payments.status,
            createdAt: payments.createdAt,
          })
          .from(payments)
          .where(
            and(
              eq(payments.tenantId, tenant.id),
              inArray(payments.chargeId, chargeIds),
            ),
          )
          .orderBy(desc(payments.createdAt))
      : [];

    const itemRows = chargeIds.length
      ? await tx
          .select({
            id: chargeItems.id,
            chargeId: chargeItems.chargeId,
            description: chargeItems.description,
            quantity: chargeItems.quantity,
            totalCents: chargeItems.totalCents,
          })
          .from(chargeItems)
          .where(
            and(
              eq(chargeItems.tenantId, tenant.id),
              inArray(chargeItems.chargeId, chargeIds),
            ),
          )
          .orderBy(asc(chargeItems.createdAt))
      : [];

    const walletRows = await tx
      .select({
        id: walletTransactions.id,
        amountCents: walletTransactions.amountCents,
        kind: walletTransactions.kind,
        createdAt: walletTransactions.createdAt,
      })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.tenantId, tenant.id),
          eq(walletTransactions.clientId, id),
        ),
      )
      .orderBy(desc(walletTransactions.createdAt));

    const spendRows = await tx
      .select({
        clientId: charges.clientId,
        total: sum(payments.amountCents),
      })
      .from(payments)
      .innerJoin(charges, eq(charges.id, payments.chargeId))
      .where(
        and(
          eq(payments.tenantId, tenant.id),
          eq(payments.status, "confirmed"),
        ),
      )
      .groupBy(charges.clientId);

    return {
      client,
      appointmentRows,
      chargeRows,
      paymentRows,
      itemRows,
      walletRows,
      spendRows,
    };
  });

  if (!data.client) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Cliente não encontrado</h1>
        <p className="mt-2 text-foreground/70">
          <Link href="/clients" className="text-brand hover:underline">
            Voltar para clientes
          </Link>
        </p>
      </div>
    );
  }

  const client = data.client;

  const paymentsByCharge = new Map<string, number>();
  for (const row of data.paymentRows) {
    if (row.status !== "confirmed") continue;
    paymentsByCharge.set(
      row.chargeId,
      (paymentsByCharge.get(row.chargeId) ?? 0) + row.amountCents,
    );
  }
  const itemsByCharge = new Map<string, typeof data.itemRows>();
  for (const row of data.itemRows) {
    const list = itemsByCharge.get(row.chargeId) ?? [];
    list.push(row);
    itemsByCharge.set(row.chargeId, list);
  }

  const walletBalance = data.walletRows.reduce(
    (sum, row) => sum + row.amountCents,
    0,
  );
  const totalCharged = data.chargeRows
    .filter((row) => row.status !== "void")
    .reduce((sum, row) => sum + row.totalCents, 0);
  const totalPaid = data.paymentRows
    .filter((row) => row.status === "confirmed")
    .reduce((sum, row) => sum + row.amountCents, 0);
  const receivable = data.chargeRows
    .filter((row) => row.status === "open")
    .reduce(
      (sum, row) => sum + Math.max(0, row.totalCents - (paymentsByCharge.get(row.id) ?? 0)),
      0,
    );

  const attended = data.appointmentRows.filter(
    (row) => row.status !== "cancelled" && row.status !== "no_show",
  );
  const firstVisitAt = attended.length
    ? new Date(Math.min(...attended.map((row) => row.startsAt.getTime())))
    : null;
  const lastVisitAt = attended.length
    ? new Date(Math.max(...attended.map((row) => row.startsAt.getTime())))
    : null;
  const now = new Date();
  const visitMetrics = {
    visits: attended.length,
    firstVisitAt,
    lastVisitAt,
  };
  const vipThreshold = vipThresholdCents(
    data.spendRows.map((row) => Number(row.total ?? 0)),
  );
  const segment = classifyClient(visitMetrics, now);
  const segmentFrequency = frequencyDays(visitMetrics);
  const nextVisit = suggestedNextVisit(visitMetrics);
  const insights = [
    {
      label: "Segmento",
      value: CLIENT_SEGMENT_LABELS[segment] + (isVip(totalPaid, vipThreshold) ? " · VIP" : ""),
    },
    { label: "Visitas", value: String(attended.length) },
    { label: "Ticket médio", value: formatCentsBRL(averageTicketCents(totalPaid, attended.length)) },
    { label: "Total gasto (LTV)", value: formatCentsBRL(totalPaid) },
    {
      label: "Frequência",
      value: segmentFrequency !== null ? `${segmentFrequency} dias` : "—",
    },
    {
      label: "Última visita",
      value: lastVisitAt
        ? `há ${Math.max(0, daysBetween(lastVisitAt, now))} dia(s)`
        : "—",
    },
    {
      label: "Próximo retorno sugerido",
      value: nextVisit
        ? new Intl.DateTimeFormat("pt-BR", { timeZone: TZ }).format(nextVisit)
        : "—",
    },
  ];

  const summary = [
    { label: "Saldo na carteira", value: walletBalance },
    { label: "Total cobrado", value: totalCharged },
    { label: "Total pago", value: totalPaid },
    { label: "A receber", value: receivable },
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Cadastros</p>
        <h1 className="mt-2 text-2xl font-semibold">{client.name}</h1>
        <p className="mt-1 text-sm text-foreground/60">
          <Link href="/clients" className="hover:underline">
            Clientes
          </Link>{" "}
          · {client.phone ?? "sem telefone"}
          {client.email ? ` · ${client.email}` : ""} ·{" "}
          {client.isActive ? "Ativo" : "Inativo"}
        </p>
        {client.notes && (
          <p className="mt-2 text-sm text-foreground/70">{client.notes}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-foreground/70">
          {client.birthday && (
            <span className="rounded-full bg-muted px-2 py-0.5">
              Aniversário:{" "}
              {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
                new Date(`${client.birthday}T00:00:00Z`),
              )}
            </span>
          )}
          {(client.tags ?? []).map((value) => (
            <span key={value} className="rounded-full bg-muted px-2 py-0.5">
              {value}
            </span>
          ))}
          {client.marketingOptIn && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
              Aceita comunicações
            </span>
          )}
        </div>
        {client.preferences && (
          <p className="mt-2 text-sm text-foreground/70">
            <span className="font-medium text-foreground/60">Preferências: </span>
            {client.preferences}
          </p>
        )}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((card) => (
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
          Inteligência do cliente
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {insights.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-border bg-white/70 p-4"
            >
              <p className="text-xs uppercase tracking-wide text-foreground/70">
                {card.label}
              </p>
              <p className="mt-1 text-lg font-semibold">{card.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Atendimentos
        </h2>
        <div className="mt-4 space-y-2">
          {data.appointmentRows.map((row) => {
            const timezone = row.branchTimezone ?? TZ;
            const startsAt = row.startsAt.toISOString();
            const endsAt = row.endsAt.toISOString();
            return (
              <article
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white/60 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {formatDateTime(startsAt, timezone)} ·{" "}
                    {row.serviceName ?? "—"}
                  </p>
                  <p className="text-xs text-foreground/70">
                    {row.professionalName ?? "—"} · {row.branchName ?? "—"} ·{" "}
                    {formatInTimeZone(startsAt, timezone)}–
                    {formatInTimeZone(endsAt, timezone)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-brand">
                    {formatCentsBRL(row.priceCents)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLES[row.status]}`}
                  >
                    {STATUS_LABELS[row.status]}
                  </span>
                </div>
              </article>
            );
          })}
          {data.appointmentRows.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum atendimento registrado.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Cobranças e pagamentos
        </h2>
        <div className="mt-4 space-y-3">
          {data.chargeRows.map((charge) => {
            const items = itemsByCharge.get(charge.id) ?? [];
            const chargePayments = data.paymentRows.filter(
              (row) => row.chargeId === charge.id,
            );
            const paid = paymentsByCharge.get(charge.id) ?? 0;
            return (
              <article
                key={charge.id}
                className="rounded-xl border border-border bg-white/60 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {formatCentsBRL(charge.totalCents)}
                      <span className="ml-2 text-xs text-foreground/70">
                        {formatDateTime(charge.createdAt.toISOString(), TZ)}
                      </span>
                    </p>
                    {charge.status === "paid" && paid !== charge.totalCents && (
                      <p className="text-xs text-foreground/70">
                        Pago {formatCentsBRL(paid)}
                      </p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${CHARGE_STYLES[charge.status]}`}
                  >
                    {CHARGE_LABELS[charge.status] ?? charge.status}
                  </span>
                </div>

                {items.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="flex justify-between text-xs text-foreground/60"
                      >
                        <span>
                          {item.quantity}× {item.description}
                        </span>
                        <span>{formatCentsBRL(item.totalCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {chargePayments.length > 0 && (
                  <ul className="mt-2 space-y-0.5 border-t border-border pt-2">
                    {chargePayments.map((payment) => (
                      <li
                        key={payment.id}
                        className="flex justify-between text-xs text-foreground/60"
                      >
                        <span>
                          {METHOD_LABELS[payment.method] ?? payment.method} ·{" "}
                          {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                        </span>
                        <span>{formatCentsBRL(payment.amountCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
          {data.chargeRows.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhuma cobrança registrada.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Carteira (crédito pré-pago)
        </h2>
        <div className="mt-4 space-y-2">
          {data.walletRows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between rounded-lg border border-border bg-white/60 px-3 py-2 text-sm"
            >
              <span className="text-foreground/60">
                {WALLET_KIND_LABELS[row.kind] ?? row.kind} ·{" "}
                {formatDateTime(row.createdAt.toISOString(), TZ)}
              </span>
              <span
                className={
                  row.amountCents >= 0
                    ? "font-medium text-emerald-700"
                    : "font-medium text-red-600"
                }
              >
                {formatCentsBRL(row.amountCents)}
              </span>
            </div>
          ))}
          {data.walletRows.length === 0 && (
            <p className="text-sm text-foreground/60">
              Sem movimentações na carteira.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
