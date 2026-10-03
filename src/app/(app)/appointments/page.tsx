import Link from "next/link";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import {
  appointments,
  branches,
  charges,
  clients,
  memberships,
  professionalBranches,
  professionalServices,
  professionals,
  services,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { formatInTimeZone, zonedTimeToUtc } from "@/lib/timezone";
import { AppointmentForm } from "./appointment-form";
import { AppointmentRow } from "./appointment-row";
import type {
  Appointment,
  AppointmentStatus,
  BranchOption,
  ClientOption,
  ProfessionalOption,
  ServiceOption,
} from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager", "staff"];

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export default async function AppointmentsPage({
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
          Selecione ou configure um tenant para ver a agenda.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const branchRows = await tx
      .select({ id: branches.id, name: branches.name, timezone: branches.timezone })
      .from(branches)
      .where(and(eq(branches.tenantId, tenant.id), eq(branches.isActive, true)))
      .orderBy(asc(branches.name));

    const professionalRows = await tx
      .select({ id: professionals.id, name: professionals.name })
      .from(professionals)
      .where(
        and(
          eq(professionals.tenantId, tenant.id),
          eq(professionals.isActive, true),
        ),
      )
      .orderBy(asc(professionals.name));

    const proBranchRows = await tx
      .select({
        professionalId: professionalBranches.professionalId,
        branchId: professionalBranches.branchId,
      })
      .from(professionalBranches)
      .where(eq(professionalBranches.tenantId, tenant.id));

    const proServiceRows = await tx
      .select({
        professionalId: professionalServices.professionalId,
        serviceId: professionalServices.serviceId,
      })
      .from(professionalServices)
      .where(eq(professionalServices.tenantId, tenant.id));

    const serviceRows = await tx
      .select({
        id: services.id,
        name: services.name,
        priceCents: services.priceCents,
        durationMinutes: services.durationMinutes,
      })
      .from(services)
      .where(and(eq(services.tenantId, tenant.id), eq(services.isActive, true)))
      .orderBy(asc(services.name));

    const clientRows = await tx
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(eq(clients.tenantId, tenant.id), eq(clients.isActive, true)))
      .orderBy(asc(clients.name));

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

    const proBranchMap = new Map<string, string[]>();
    for (const row of proBranchRows) {
      const list = proBranchMap.get(row.professionalId) ?? [];
      list.push(row.branchId);
      proBranchMap.set(row.professionalId, list);
    }
    const proServiceMap = new Map<string, string[]>();
    for (const row of proServiceRows) {
      const list = proServiceMap.get(row.professionalId) ?? [];
      list.push(row.serviceId);
      proServiceMap.set(row.professionalId, list);
    }

    const professionalsList: ProfessionalOption[] = professionalRows.map(
      (row) => ({
        id: row.id,
        name: row.name,
        branchIds: proBranchMap.get(row.id) ?? [],
        serviceIds: proServiceMap.get(row.id) ?? [],
      }),
    );

    return {
      branches: branchRows,
      professionals: professionalsList,
      services: serviceRows as ServiceOption[],
      clients: clientRows as ClientOption[],
      canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
    };
  });

  const branchesList: BranchOption[] = data.branches;

  if (branchesList.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Cadastre uma filial</h1>
        <p className="mt-2 text-foreground/70">
          A agenda é por filial. Crie uma em{" "}
          <Link href="/branches" className="text-brand hover:underline">
            Filiais
          </Link>
          .
        </p>
      </div>
    );
  }

  const selectedBranch =
    branchesList.find((branch) => branch.id === first(sp.branch)) ?? branchesList[0];
  const date = first(sp.date) ?? new Date().toISOString().slice(0, 10);

  const dayStart = zonedTimeToUtc(date, "00:00", selectedBranch.timezone);
  const dayEnd = zonedTimeToUtc(addDays(date, 1), "00:00", selectedBranch.timezone);

  const { appointmentRows, chargeByAppointment } = await withUser(
    userId,
    async (tx) => {
      const rows = await tx
        .select({
          id: appointments.id,
          professionalId: appointments.professionalId,
          serviceId: appointments.serviceId,
          clientId: appointments.clientId,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          status: appointments.status,
          priceCents: appointments.priceCents,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.tenantId, tenant.id),
            eq(appointments.branchId, selectedBranch.id),
            gte(appointments.startsAt, dayStart),
            lt(appointments.startsAt, dayEnd),
          ),
        )
        .orderBy(asc(appointments.startsAt));

      const ids = rows.map((row) => row.id);
      const chargeRows = ids.length
        ? await tx
            .select({ appointmentId: charges.appointmentId, status: charges.status })
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

      return { appointmentRows: rows, chargeByAppointment: chargeMap };
    },
  );

  const professionalName = new Map(
    data.professionals.map((professional) => [professional.id, professional.name]),
  );
  const serviceName = new Map(data.services.map((service) => [service.id, service.name]));
  const clientName = new Map(data.clients.map((client) => [client.id, client.name]));

  const list: Array<{
    appointment: Appointment;
    timeLabel: string;
    chargeStatus: "none" | "open" | "paid" | "void";
  }> = appointmentRows.map((row) => {
    const startsAt = row.startsAt.toISOString();
    const endsAt = row.endsAt.toISOString();
    const appointment: Appointment = {
      id: row.id,
      branchId: selectedBranch.id,
      branchName: selectedBranch.name,
      professionalName: professionalName.get(row.professionalId) ?? "—",
      serviceName: serviceName.get(row.serviceId) ?? "—",
      clientName: clientName.get(row.clientId) ?? "—",
      startsAt,
      endsAt,
      status: row.status as AppointmentStatus,
      priceCents: row.priceCents,
    };
    const timeLabel = `${formatInTimeZone(startsAt, selectedBranch.timezone)}–${formatInTimeZone(endsAt, selectedBranch.timezone)}`;
    const chargeStatus = (chargeByAppointment.get(row.id) ?? "none") as
      | "none"
      | "open"
      | "paid"
      | "void";
    return { appointment, timeLabel, chargeStatus };
  });

  const query = (params: Record<string, string>) =>
    `/appointments?${new URLSearchParams(params).toString()}`;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Agenda</p>
        <h1 className="mt-2 text-2xl font-semibold">Agendamentos</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Reserve serviços e acompanhe o status dos atendimentos.
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
            Filial
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {branchesList.map((branch) => (
              <Link
                key={branch.id}
                href={query({ branch: branch.id, date })}
                className={`rounded-full border px-3 py-1 text-xs ${
                  branch.id === selectedBranch.id
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border bg-white hover:bg-muted"
                }`}
              >
                {branch.name}
              </Link>
            ))}
          </div>
        </div>

        <form method="get" action="/appointments" className="flex items-end gap-2">
          <input type="hidden" name="branch" value={selectedBranch.id} />
          <div>
            <label className="text-xs font-medium text-foreground/60">Data</label>
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
            Ver dia
          </button>
        </form>
      </section>

      {data.canManage && data.professionals.length > 0 && (
        <AppointmentForm
          branches={branchesList}
          professionals={data.professionals}
          services={data.services}
          clients={data.clients}
        />
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            {date}
          </h2>
          <span className="text-xs text-foreground/50">
            {list.length} agendamento(s)
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(({ appointment, timeLabel, chargeStatus }) => (
            <AppointmentRow
              key={appointment.id}
              appointment={appointment}
              timeLabel={timeLabel}
              chargeStatus={chargeStatus}
            />
          ))}

          {list.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum agendamento para esta data.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
