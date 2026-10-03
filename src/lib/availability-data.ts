import { and, eq, gte, lt, ne } from "drizzle-orm";
import {
  appointments,
  branchClosures,
  branchHours,
  branches,
  professionalBranches,
  professionalHours,
  professionalServices,
  services,
  serviceBranches,
} from "@/db/schema";
import {
  computeAvailableSlots,
  timeToMinutes,
  type Closure,
  type WeeklyHour,
} from "@/lib/availability";
import type { AppTx } from "@/lib/db";
import { zonedMinutesOfDay, zonedTimeToUtc } from "@/lib/timezone";

export const STEP_MINUTES = 30;

export type SlotsContext =
  | {
      slots: string[];
      durationMinutes: number;
      priceCents: number;
      timezone: string;
    }
  | { error: string };

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function toWeekly(
  rows: Array<{ weekday: number; startTime: string; endTime: string }>,
): WeeklyHour[] {
  return rows.map((row) => ({
    weekday: Number(row.weekday),
    start: timeToMinutes(row.startTime),
    end: timeToMinutes(row.endTime),
  }));
}

export async function computeSlotsForDay(
  tx: AppTx,
  tenantId: string,
  params: {
    branchId: string;
    professionalId: string;
    serviceId: string;
    date: string;
  },
): Promise<SlotsContext> {
  const [branch] = await tx
    .select({ id: branches.id, timezone: branches.timezone })
    .from(branches)
    .where(and(eq(branches.id, params.branchId), eq(branches.tenantId, tenantId)))
    .limit(1);
  if (!branch) return { error: "Filial não encontrada." };
  const timezone = branch.timezone;

  const [service] = await tx
    .select({
      id: services.id,
      durationMinutes: services.durationMinutes,
      priceCents: services.priceCents,
      isActive: services.isActive,
    })
    .from(services)
    .where(and(eq(services.id, params.serviceId), eq(services.tenantId, tenantId)))
    .limit(1);
  if (!service || !service.isActive) return { error: "Serviço indisponível." };

  const [proService] = await tx
    .select({ id: professionalServices.id })
    .from(professionalServices)
    .where(
      and(
        eq(professionalServices.tenantId, tenantId),
        eq(professionalServices.professionalId, params.professionalId),
        eq(professionalServices.serviceId, params.serviceId),
      ),
    )
    .limit(1);
  if (!proService) return { error: "O profissional não realiza este serviço." };

  const [proBranch] = await tx
    .select({ id: professionalBranches.id })
    .from(professionalBranches)
    .where(
      and(
        eq(professionalBranches.tenantId, tenantId),
        eq(professionalBranches.professionalId, params.professionalId),
        eq(professionalBranches.branchId, params.branchId),
      ),
    )
    .limit(1);
  if (!proBranch) return { error: "O profissional não atende nesta filial." };

  const [serviceBranch] = await tx
    .select({
      priceCents: serviceBranches.priceCents,
      durationMinutes: serviceBranches.durationMinutes,
      isActive: serviceBranches.isActive,
    })
    .from(serviceBranches)
    .where(
      and(
        eq(serviceBranches.tenantId, tenantId),
        eq(serviceBranches.serviceId, params.serviceId),
        eq(serviceBranches.branchId, params.branchId),
      ),
    )
    .limit(1);

  let durationMinutes = service.durationMinutes;
  let priceCents = service.priceCents;
  if (serviceBranch) {
    if (!serviceBranch.isActive) {
      return { error: "Serviço indisponível nesta filial." };
    }
    if (serviceBranch.durationMinutes != null) {
      durationMinutes = serviceBranch.durationMinutes;
    }
    if (serviceBranch.priceCents != null) priceCents = serviceBranch.priceCents;
  }

  const dayStart = zonedTimeToUtc(params.date, "00:00", timezone);
  const dayEnd = zonedTimeToUtc(addDays(params.date, 1), "00:00", timezone);

  const busyRows = await tx
    .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.professionalId, params.professionalId),
        ne(appointments.status, "cancelled"),
        gte(appointments.startsAt, dayStart),
        lt(appointments.startsAt, dayEnd),
      ),
    );

  const busy = busyRows.map((row) => ({
    start: zonedMinutesOfDay(row.startsAt.toISOString(), timezone),
    end: zonedMinutesOfDay(row.endsAt.toISOString(), timezone),
  }));

  const bh = await tx
    .select({
      weekday: branchHours.weekday,
      startTime: branchHours.startTime,
      endTime: branchHours.endTime,
    })
    .from(branchHours)
    .where(
      and(
        eq(branchHours.tenantId, tenantId),
        eq(branchHours.branchId, params.branchId),
      ),
    );

  const ph = await tx
    .select({
      weekday: professionalHours.weekday,
      startTime: professionalHours.startTime,
      endTime: professionalHours.endTime,
    })
    .from(professionalHours)
    .where(
      and(
        eq(professionalHours.tenantId, tenantId),
        eq(professionalHours.professionalId, params.professionalId),
      ),
    );

  const closureRows = await tx
    .select({
      startDate: branchClosures.startDate,
      endDate: branchClosures.endDate,
      startTime: branchClosures.startTime,
      endTime: branchClosures.endTime,
    })
    .from(branchClosures)
    .where(
      and(
        eq(branchClosures.tenantId, tenantId),
        eq(branchClosures.branchId, params.branchId),
      ),
    );

  const closures: Closure[] = closureRows.map((row) => ({
    startDate: row.startDate,
    endDate: row.endDate,
    start: row.startTime ? timeToMinutes(row.startTime) : null,
    end: row.endTime ? timeToMinutes(row.endTime) : null,
  }));

  const slots = computeAvailableSlots({
    date: params.date,
    branchHours: toWeekly(bh),
    professionalHours: toWeekly(ph),
    closures,
    durationMinutes,
    stepMinutes: STEP_MINUTES,
    busy,
  });

  return { slots, durationMinutes, priceCents, timezone };
}
