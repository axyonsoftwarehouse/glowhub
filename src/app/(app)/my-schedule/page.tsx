import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import {
  appointments,
  branches,
  charges,
  clients,
  services,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { formatCentsBRL } from "@/lib/money";
import { getSession } from "@/lib/session";
import { getCurrentTenant, getMyProfessional } from "@/lib/tenant";
import {
  formatInTimeZone,
  zonedDateKey,
  zonedTimeToUtc,
} from "@/lib/timezone";
import { ScheduleItem, type ScheduleItemData } from "./schedule-item";
import type { AppointmentStatus } from "@/app/(app)/appointments/types";

export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function formatDayLabel(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export default async function MySchedulePage({
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
          Selecione ou configure um tenant para ver sua agenda.
        </p>
      </div>
    );
  }

  const professional = await getMyProfessional();

  if (!professional) {
    return (
      <div className="space-y-4">
        <header>
          <p className="text-xs uppercase tracking-widest text-brand">Agenda</p>
          <h1 className="mt-2 text-2xl font-semibold">Minha agenda</h1>
        </header>
        <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
          <p className="font-medium">Seu acesso não está vinculado a um profissional.</p>
          <p className="mt-2 text-foreground/70">
            Peça a um administrador para vincular seu usuário a um profissional
            em <span className="font-medium">Profissionais</span>.
          </p>
        </div>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const range = first(sp.range) === "week" ? "week" : "day";
  const date = first(sp.date) ?? zonedDateKey(new Date().toISOString(), TZ);
  const dayCount = range === "week" ? 7 : 1;
  const rangeStart = zonedTimeToUtc(date, "00:00", TZ);
  const rangeEnd = zonedTimeToUtc(addDays(date, dayCount), "00:00", TZ);

  const rows = await withUser(userId, async (tx) => {
    const appointmentRows = await tx
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        priceCents: appointments.priceCents,
        branchName: branches.name,
        branchTimezone: branches.timezone,
        serviceName: services.name,
        clientName: clients.name,
      })
      .from(appointments)
      .leftJoin(branches, eq(branches.id, appointments.branchId))
      .leftJoin(services, eq(services.id, appointments.serviceId))
      .leftJoin(clients, eq(clients.id, appointments.clientId))
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          eq(appointments.professionalId, professional.id),
          gte(appointments.startsAt, rangeStart),
          lt(appointments.startsAt, rangeEnd),
        ),
      )
      .orderBy(asc(appointments.startsAt));

    const ids = appointmentRows.map((row) => row.id);
    const chargeRows = ids.length
      ? await tx
          .select({
            appointmentId: charges.appointmentId,
            status: charges.status,
          })
          .from(charges)
          .where(
            and(
              eq(charges.tenantId, tenant.id),
              inArray(charges.appointmentId, ids),
            ),
          )
      : [];

    const chargeMap = new Map(
      chargeRows
        .filter((row) => row.appointmentId)
        .map((row) => [row.appointmentId as string, row.status]),
    );

    return { appointmentRows, chargeByAppointment: chargeMap };
  });

  const items: Array<{ dayKey: string; item: ScheduleItemData }> =
    rows.appointmentRows.map((row) => {
      const timezone = row.branchTimezone ?? TZ;
      const startsAt = row.startsAt.toISOString();
      const endsAt = row.endsAt.toISOString();
      const chargeStatus = (rows.chargeByAppointment.get(row.id) ?? "none") as
        | "none"
        | "open"
        | "paid"
        | "void";
      return {
        dayKey: zonedDateKey(startsAt, timezone),
        item: {
          id: row.id,
          timeLabel: `${formatInTimeZone(startsAt, timezone)}–${formatInTimeZone(endsAt, timezone)}`,
          clientName: row.clientName ?? "—",
          serviceName: row.serviceName ?? "—",
          branchName: row.branchName ?? "—",
          status: row.status as AppointmentStatus,
          priceCents: row.priceCents,
          chargeStatus,
        },
      };
    });

  const dayKeys = Array.from({ length: dayCount }, (_, i) => addDays(date, i));
  const groups = dayKeys
    .map((dayKey) => ({
      dayKey,
      items: items.filter((entry) => entry.dayKey === dayKey).map((e) => e.item),
    }))
    .filter((group) => group.items.length > 0);

  const dayTotalCents = items
    .filter((entry) => entry.item.status !== "cancelled" && entry.item.status !== "no_show")
    .reduce((sum, entry) => sum + entry.item.priceCents, 0);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Agenda</p>
        <h1 className="mt-2 text-2xl font-semibold">Minha agenda</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {professional.name} · {items.length} atendimento(s) no{" "}
          {range === "week" ? "período" : "dia"}
        </p>
      </header>

      <section>
        <div className="flex flex-wrap items-center gap-2">
          {(["day", "week"] as const).map((option) => (
            <a
              key={option}
              href={`/my-schedule?${new URLSearchParams({ range: option, date }).toString()}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                option === range
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-white hover:bg-muted"
              }`}
            >
              {option === "day" ? "Dia" : "Semana"}
            </a>
          ))}
        </div>

        <form method="get" action="/my-schedule" className="mt-3 flex items-end gap-2">
          <input type="hidden" name="range" value={range} />
          <div>
            <label className="text-xs font-medium text-foreground/60">
              {range === "week" ? "Início da semana" : "Data"}
            </label>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="mt-1 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <button
            type="submit"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Ver
          </button>
        </form>
      </section>

      <section className="space-y-6">
        {groups.map((group) => (
          <div key={group.dayKey}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
              {formatDayLabel(group.dayKey)}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <ScheduleItem key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <p className="text-sm text-foreground/60">
            Nenhum agendamento no período.
          </p>
        )}

        {items.length > 0 && (
          <p className="text-sm text-foreground/60">
            Total previsto (exceto cancelados/não compareceu):{" "}
            <strong>{formatCentsBRL(dayTotalCents)}</strong>
          </p>
        )}
      </section>
    </div>
  );
}
