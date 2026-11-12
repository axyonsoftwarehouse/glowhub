import Link from "next/link";
import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import {
  appointments,
  branchHours,
  branches,
  charges,
  clients,
  ledgerAccounts,
  memberships,
  payments,
  professionals,
  services,
} from "@/db/schema";
import { AppointmentRow } from "@/app/(app)/appointments/appointment-row";
import type { Appointment } from "@/app/(app)/appointments/types";
import { addDays } from "@/lib/availability-data";
import { withUser } from "@/lib/db";
import { formatCentsBRL } from "@/lib/money";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { zonedDateKey, zonedTimeToUtc } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const QUICK_ACTIONS = [
  { href: "/appointments", label: "Novo agendamento", tone: "primary" },
  { href: "/clients", label: "Novo cliente", tone: "muted" },
  { href: "/finance", label: "Receber", tone: "muted" },
  { href: "/schedule", label: "Bloquear horário", tone: "muted" },
] as const;

export default async function DashboardPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhum tenant resolvido</h1>
        <p className="mt-2 text-foreground/70">
          Defina <code className="font-mono">DEFAULT_TENANT_SLUG</code> (ex.:
          <code className="font-mono">demo</code>) para desenvolvimento, ou acesse
          via subdomínio (<code className="font-mono">demo.SEU_DOMINIO</code>).
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const branchRows = await tx
      .select({
        id: branches.id,
        name: branches.name,
        slug: branches.slug,
        address: branches.address,
        isActive: branches.isActive,
        timezone: branches.timezone,
      })
      .from(branches)
      .where(eq(branches.tenantId, tenant.id))
      .orderBy(asc(branches.name));

    const primaryBranch =
      branchRows.find((branch) => branch.isActive) ?? branchRows[0] ?? null;
    const timezone = primaryBranch?.timezone ?? "America/Sao_Paulo";
    const today = zonedDateKey(new Date().toISOString(), timezone);
    const tomorrow = addDays(today, 1);
    const start = zonedTimeToUtc(today, "00:00", timezone);
    const end = zonedTimeToUtc(tomorrow, "00:00", timezone);

    const appointmentRows = await tx
      .select({
        id: appointments.id,
        branchId: appointments.branchId,
        branchName: branches.name,
        professionalName: professionals.name,
        serviceName: services.name,
        clientName: clients.name,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        priceCents: appointments.priceCents,
      })
      .from(appointments)
      .innerJoin(branches, eq(branches.id, appointments.branchId))
      .innerJoin(
        professionals,
        eq(professionals.id, appointments.professionalId),
      )
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          gte(appointments.startsAt, start),
          lte(appointments.startsAt, end),
        ),
      )
      .orderBy(asc(appointments.startsAt));

    const appointmentIds = appointmentRows.map((row) => row.id);
    const chargeRows = appointmentIds.length
      ? await tx
          .select({ appointmentId: charges.appointmentId, status: charges.status })
          .from(charges)
          .where(
            and(
              eq(charges.tenantId, tenant.id),
              ne(charges.status, "void"),
              inArray(charges.appointmentId, appointmentIds),
            ),
          )
      : [];

    const paidRows = await tx
      .select({
        total: sql<number>`coalesce(sum(${payments.amountCents}), 0)`.mapWith(
          Number,
        ),
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenant.id),
          eq(payments.status, "confirmed"),
          gte(payments.createdAt, start),
          lte(payments.createdAt, end),
        ),
      );

    const openRows = await tx
      .select({
        total: sql<number>`coalesce(sum(${charges.totalCents}), 0)`.mapWith(
          Number,
        ),
      })
      .from(charges)
      .where(
        and(eq(charges.tenantId, tenant.id), eq(charges.status, "open")),
      );

    const [serviceCount] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(services)
      .where(
        and(eq(services.tenantId, tenant.id), eq(services.isActive, true)),
      );
    const [professionalCount] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(professionals)
      .where(
        and(
          eq(professionals.tenantId, tenant.id),
          eq(professionals.isActive, true),
        ),
      );
    const [hourCount] = primaryBranch
      ? await tx
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(branchHours)
          .where(
            and(
              eq(branchHours.tenantId, tenant.id),
              eq(branchHours.branchId, primaryBranch.id),
            ),
          )
      : [{ count: 0 }];
    const [chartCount] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.tenantId, tenant.id));

    const [linkedProfessional] = await tx
      .select({ id: professionals.id, name: professionals.name })
      .from(professionals)
      .where(
        and(
          eq(professionals.tenantId, tenant.id),
          eq(professionals.userId, userId),
        ),
      )
      .limit(1);

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
      branchRows,
      primaryBranch,
      timezone,
      today,
      appointmentRows,
      chargeRows,
      paidToday: paidRows[0]?.total ?? 0,
      openTotal: openRows[0]?.total ?? 0,
      counts: {
        services: serviceCount?.count ?? 0,
        professionals: professionalCount?.count ?? 0,
        hours: hourCount?.count ?? 0,
        chart: chartCount?.count ?? 0,
      },
      linkedProfessional: linkedProfessional ?? null,
      role: membership?.role ?? "",
    };
  });

  const chargeByAppointment = new Map(
    data.chargeRows
      .filter((row) => row.appointmentId)
      .map((row) => [row.appointmentId as string, row.status]),
  );

  const todayLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: data.timezone,
  }).format(new Date());

  const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: data.timezone,
  });

  const missingSetup = [
    !data.counts.services
      ? {
          href: "/services",
          title: "Cadastre seu primeiro serviço",
          detail: "Nome, duração e preço do atendimento.",
        }
      : null,
    !data.counts.hours
      ? {
          href: "/schedule",
          title: "Defina seus horários",
          detail: "Dias e faixas em que você atende.",
        }
      : null,
    !data.linkedProfessional
      ? {
          href: "/professionals",
          title: "Vincule seu profissional",
          detail: "Para a agenda aparecer em “Minha agenda”.",
        }
      : null,
    !data.counts.chart
      ? {
          href: "/finance",
          title: "Aplique o plano de contas",
          detail: "Necessário para cobranças e caixa.",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const metrics = [
    { label: "Atendimentos hoje", value: String(data.appointmentRows.length) },
    { label: "Recebido hoje", value: formatCentsBRL(data.paidToday) },
    { label: "A receber", value: formatCentsBRL(data.openTotal) },
    {
      label: "Próximo",
      value: data.appointmentRows.length
        ? timeFormatter.format(data.appointmentRows[0].startsAt)
        : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-widest text-brand">Hoje</p>
          {tenant.isSolo && (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
              Modo solo
            </span>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold first-letter:uppercase">{todayLabel}</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {tenant.name}
          {data.primaryBranch ? ` · ${data.primaryBranch.name}` : ""}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-border bg-white/70 p-3"
          >
            <p className="text-[11px] uppercase tracking-wide text-foreground/60">
              {metric.label}
            </p>
            <p className="mt-1 text-lg font-semibold">{metric.value}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`rounded-xl px-3 py-2.5 text-center text-sm font-medium ${
                action.tone === "primary"
                  ? "bg-brand text-brand-foreground"
                  : "border border-border bg-white/70 text-foreground/80"
              }`}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </section>

      {tenant.isSolo && missingSetup.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            Falta pouco para sua agenda rodar
          </h2>
          <ul className="mt-3 space-y-2">
            {missingSetup.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-start justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="block font-medium text-amber-900">
                      {item.title}
                    </span>
                    <span className="text-xs text-amber-800/80">
                      {item.detail}
                    </span>
                  </span>
                  <span className="shrink-0 text-amber-900">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Atendimentos de hoje
          </h2>
          <Link
            href="/appointments"
            className="text-xs font-medium text-brand hover:underline"
          >
            Ver agenda
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {data.appointmentRows.map((row) => {
            const appointment: Appointment = {
              id: row.id,
              branchId: row.branchId,
              branchName: row.branchName,
              professionalName: row.professionalName,
              serviceName: row.serviceName,
              clientName: row.clientName,
              startsAt: row.startsAt.toISOString(),
              endsAt: row.endsAt.toISOString(),
              status: row.status,
              priceCents: row.priceCents,
            };
            return (
              <AppointmentRow
                key={row.id}
                appointment={appointment}
                timeLabel={timeFormatter.format(row.startsAt)}
                chargeStatus={
                  (chargeByAppointment.get(row.id) as
                    | "open"
                    | "paid"
                    | undefined) ?? "none"
                }
              />
            );
          })}

          {data.appointmentRows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="text-sm font-medium">Nenhum atendimento hoje.</p>
              <p className="mt-1 text-xs text-foreground/60">
                Crie um agendamento ou compartilhe seu link de booking.
              </p>
              <Link
                href="/appointments"
                className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
              >
                Novo agendamento
              </Link>
            </div>
          )}
        </div>
      </section>

      {!tenant.isSolo && data.branchRows.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Filiais
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.branchRows.map((branch) => (
              <article
                key={branch.id}
                className="rounded-xl border border-border bg-white/70 p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{branch.name}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      branch.isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {branch.isActive ? "Ativa" : "Inativa"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-foreground/70">
                  /{branch.slug}
                </p>
                {branch.address && (
                  <p className="mt-2 text-sm text-foreground/70">
                    {branch.address}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
