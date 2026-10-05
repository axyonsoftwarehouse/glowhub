import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import {
  branchClosures,
  branchHours,
  branches,
  memberships,
  professionalHours,
  professionals,
  services,
} from "@/db/schema";
import {
  computeAvailableSlots,
  timeToMinutes,
  type Closure,
  type WeeklyHour,
} from "@/lib/availability";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { ClosureManager } from "./closure-manager";
import { WeeklyHoursEditor } from "./weekly-hours-editor";
import type {
  BranchOption,
  ClosureItem,
  ProfessionalOption,
  ServiceOption,
  WeeklyHoursEntry,
} from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function SchedulePage({
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
          Selecione ou configure um tenant para configurar a agenda.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const branchRows = await tx
      .select({ id: branches.id, name: branches.name })
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

    const serviceRows = await tx
      .select({
        id: services.id,
        name: services.name,
        durationMinutes: services.durationMinutes,
      })
      .from(services)
      .where(and(eq(services.tenantId, tenant.id), eq(services.isActive, true)))
      .orderBy(asc(services.name));

    const branchHourRows = await tx
      .select({
        branchId: branchHours.branchId,
        weekday: branchHours.weekday,
        startTime: branchHours.startTime,
        endTime: branchHours.endTime,
      })
      .from(branchHours)
      .where(eq(branchHours.tenantId, tenant.id))
      .orderBy(asc(branchHours.weekday), asc(branchHours.startTime));

    const proHourRows = await tx
      .select({
        professionalId: professionalHours.professionalId,
        weekday: professionalHours.weekday,
        startTime: professionalHours.startTime,
        endTime: professionalHours.endTime,
      })
      .from(professionalHours)
      .where(eq(professionalHours.tenantId, tenant.id))
      .orderBy(asc(professionalHours.weekday), asc(professionalHours.startTime));

    const closureRows = await tx
      .select({
        id: branchClosures.id,
        branchId: branchClosures.branchId,
        startDate: branchClosures.startDate,
        endDate: branchClosures.endDate,
        startTime: branchClosures.startTime,
        endTime: branchClosures.endTime,
        reason: branchClosures.reason,
      })
      .from(branchClosures)
      .where(eq(branchClosures.tenantId, tenant.id))
      .orderBy(asc(branchClosures.startDate));

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
      branches: branchRows,
      professionals: professionalRows,
      services: serviceRows,
      branchHourRows,
      proHourRows,
      closureRows,
      canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
    };
  });

  const branchesList: BranchOption[] = data.branches;
  const professionalsList: ProfessionalOption[] = data.professionals;
  const servicesList: ServiceOption[] = data.services.map((row) => ({
    id: row.id,
    name: row.name,
    durationMinutes: row.durationMinutes,
  }));

  if (branchesList.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Cadastre uma filial</h1>
        <p className="mt-2 text-foreground/70">
          A agenda é configurada por filial. Crie uma em{" "}
          <Link href="/branches" className="text-brand hover:underline">
            Filiais
          </Link>
          .
        </p>
      </div>
    );
  }

  const toEntries = (
    rows: Array<{ weekday: number; startTime: string; endTime: string }>,
  ): WeeklyHoursEntry[] =>
    rows.map((row) => ({
      weekday: row.weekday,
      start: row.startTime.slice(0, 5),
      end: row.endTime.slice(0, 5),
    }));

  const selectedBranch =
    branchesList.find((branch) => branch.id === first(sp.branch)) ??
    branchesList[0];
  const selectedProfessional =
    professionalsList.find((pro) => pro.id === first(sp.professional)) ??
    professionalsList[0];

  const branchHoursEntries = toEntries(
    data.branchHourRows.filter((row) => row.branchId === selectedBranch.id),
  );
  const professionalHoursEntries = selectedProfessional
    ? toEntries(
        data.proHourRows.filter(
          (row) => row.professionalId === selectedProfessional.id,
        ),
      )
    : [];

  const closures: ClosureItem[] = data.closureRows
    .filter((row) => row.branchId === selectedBranch.id)
    .map((row) => ({
      id: row.id,
      startDate: row.startDate,
      endDate: row.endDate,
      startTime: row.startTime ?? null,
      endTime: row.endTime ?? null,
      reason: row.reason ?? null,
    }));

  const toWeekly = (entries: WeeklyHoursEntry[]): WeeklyHour[] =>
    entries.map((entry) => ({
      weekday: entry.weekday,
      start: timeToMinutes(entry.start),
      end: timeToMinutes(entry.end),
    }));

  const toClosures = (items: ClosureItem[]): Closure[] =>
    items.map((item) => ({
      startDate: item.startDate,
      endDate: item.endDate,
      start: item.startTime ? timeToMinutes(item.startTime) : null,
      end: item.endTime ? timeToMinutes(item.endTime) : null,
    }));

  const previewDate = first(sp.date) ?? new Date().toISOString().slice(0, 10);
  const previewService =
    servicesList.find((service) => service.id === first(sp.service)) ??
    servicesList[0];

  const slots = previewService
    ? computeAvailableSlots({
        date: previewDate,
        branchHours: toWeekly(branchHoursEntries),
        professionalHours: toWeekly(professionalHoursEntries),
        closures: toClosures(closures),
        durationMinutes: previewService.durationMinutes,
        stepMinutes: 30,
      })
    : [];

  const query = (params: Record<string, string>) =>
    `/schedule?${new URLSearchParams(params).toString()}`;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Agenda</p>
        <h1 className="mt-2 text-2xl font-semibold">Horários e disponibilidade</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Funcionamento da filial, bloqueios e jornada de cada profissional.
        </p>
      </header>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground/70">
          Filial
        </p>
        <div className="flex flex-wrap gap-2">
          {branchesList.map((branch) => (
            <Link
              key={branch.id}
              href={query({
                branch: branch.id,
                ...(selectedProfessional
                  ? { professional: selectedProfessional.id }
                  : {}),
              })}
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
      </section>

      <WeeklyHoursEditor
        key={`branch-${selectedBranch.id}`}
        ownerType="branch"
        ownerId={selectedBranch.id}
        initial={branchHoursEntries}
        canManage={data.canManage}
      />

      <ClosureManager
        branchId={selectedBranch.id}
        closures={closures}
        canManage={data.canManage}
      />

      {professionalsList.length > 0 && selectedProfessional && (
        <section className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/70">
              Profissional
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {professionalsList.map((pro) => (
                <Link
                  key={pro.id}
                  href={query({ branch: selectedBranch.id, professional: pro.id })}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    pro.id === selectedProfessional.id
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border bg-white hover:bg-muted"
                  }`}
                >
                  {pro.name}
                </Link>
              ))}
            </div>
          </div>

          <WeeklyHoursEditor
            key={`professional-${selectedProfessional.id}`}
            ownerType="professional"
            ownerId={selectedProfessional.id}
            initial={professionalHoursEntries}
            canManage={data.canManage}
          />
          <p className="text-xs text-foreground/70">
            Sem horários definidos, o profissional herda o horário da filial.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-white/70 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Prévia de disponibilidade
        </h2>

        {servicesList.length === 0 ? (
          <p className="mt-3 text-sm text-foreground/60">
            Cadastre um serviço para pré-visualizar os horários.
          </p>
        ) : (
          <>
            <form
              method="get"
              action="/schedule"
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="branch" value={selectedBranch.id} />
              {selectedProfessional && (
                <input
                  type="hidden"
                  name="professional"
                  value={selectedProfessional.id}
                />
              )}
              <div>
                <label className="text-xs font-medium text-foreground/60">Data</label>
                <input
                  type="date"
                  name="date"
                  defaultValue={previewDate}
                  className="mt-1 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground/60">
                  Serviço
                </label>
                <select
                  name="service"
                  defaultValue={previewService?.id}
                  className="mt-1 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                >
                  {servicesList.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} ({service.durationMinutes} min)
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Ver horários
              </button>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              {slots.map((slot) => (
                <span
                  key={slot}
                  className="rounded-full border border-border bg-white px-3 py-1 text-sm"
                >
                  {slot}
                </span>
              ))}
              {slots.length === 0 && (
                <p className="text-sm text-foreground/60">
                  Nenhum horário disponível para esta data.
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
