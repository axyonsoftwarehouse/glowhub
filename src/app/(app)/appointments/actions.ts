"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, lt, ne } from "drizzle-orm";
import {
  appointments,
  branchClosures,
  branchHours,
  branches,
  clients,
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
import { withUser, type AppTx } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { zonedMinutesOfDay, zonedTimeToUtc } from "@/lib/timezone";
import {
  ALLOWED_TRANSITIONS,
  type AppointmentActionState,
  type AppointmentStatus,
} from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const STEP_MINUTES = 30;

function error(message?: string): AppointmentActionState {
  return { status: "error", message: message ?? "Erro inesperado." };
}

function errorCode(cause: unknown): string | undefined {
  return (cause as { code?: string })?.code;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function toWeekly(
  rows: Array<{ weekday: number; startTime: string; endTime: string }>,
): WeeklyHour[] {
  return rows.map((row) => ({
    weekday: row.weekday,
    start: timeToMinutes(row.startTime),
    end: timeToMinutes(row.endTime),
  }));
}

type SlotsContext =
  | { slots: string[]; durationMinutes: number; priceCents: number; timezone: string }
  | { error: string };

async function computeSlotsForDay(
  tx: AppTx,
  tenantId: string,
  params: { branchId: string; professionalId: string; serviceId: string; date: string },
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
    if (serviceBranch.durationMinutes != null) durationMinutes = serviceBranch.durationMinutes;
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
    .where(and(eq(branchHours.tenantId, tenantId), eq(branchHours.branchId, params.branchId)));

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

export async function getAvailabilityAction(input: {
  branchId: string;
  professionalId: string;
  serviceId: string;
  date: string;
}): Promise<{ slots: string[] } | { error: string }> {
  if (
    !UUID_RE.test(input.branchId) ||
    !UUID_RE.test(input.professionalId) ||
    !UUID_RE.test(input.serviceId) ||
    !DATE_RE.test(input.date)
  ) {
    return { error: "Dados inválidos." };
  }

  const tenant = await getCurrentTenant();
  if (!tenant) return { error: "Empresa não resolvida." };
  const session = await getSession();
  if (!session?.user) return { error: "Sessão expirada." };

  const result = await withUser(session.user.id, (tx) =>
    computeSlotsForDay(tx, tenant.id, input),
  );
  if ("error" in result) return result;
  return { slots: result.slots };
}

export async function createAppointmentAction(
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const branchId = String(formData.get("branchId") ?? "");
  const professionalId = String(formData.get("professionalId") ?? "");
  const serviceId = String(formData.get("serviceId") ?? "");
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const newClientName = String(formData.get("newClientName") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (
    !UUID_RE.test(branchId) ||
    !UUID_RE.test(professionalId) ||
    !UUID_RE.test(serviceId) ||
    !DATE_RE.test(date) ||
    !TIME_RE.test(time)
  ) {
    return error("Preencha filial, profissional, serviço, data e horário.");
  }

  const tenant = await getCurrentTenant();
  if (!tenant) return error("Empresa não resolvida.");
  const session = await getSession();
  if (!session?.user) return error("Sessão expirada.");
  const userId = session.user.id;

  try {
    const outcome = await withUser(userId, async (tx) => {
      const ctx = await computeSlotsForDay(tx, tenant.id, {
        branchId,
        professionalId,
        serviceId,
        date,
      });
      if ("error" in ctx) return { error: ctx.error };
      if (!ctx.slots.includes(time)) {
        return { error: "Horário indisponível. Busque novamente os horários." };
      }

      let resolvedClientId = UUID_RE.test(clientId) ? clientId : null;
      if (resolvedClientId) {
        const [client] = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(and(eq(clients.id, resolvedClientId), eq(clients.tenantId, tenant.id)))
          .limit(1);
        if (!client) return { error: "Cliente não encontrado." };
      } else if (newClientName.length >= 2) {
        const [created] = await tx
          .insert(clients)
          .values({ tenantId: tenant.id, name: newClientName })
          .returning({ id: clients.id });
        resolvedClientId = created.id;
      } else {
        return { error: "Selecione um cliente ou informe o nome de um novo." };
      }

      const startsAt = zonedTimeToUtc(date, time, ctx.timezone);
      const endsAt = new Date(startsAt.getTime() + ctx.durationMinutes * 60_000);

      await tx.insert(appointments).values({
        tenantId: tenant.id,
        branchId,
        professionalId,
        serviceId,
        clientId: resolvedClientId,
        startsAt,
        endsAt,
        priceCents: ctx.priceCents,
        notes: notes.length > 0 ? notes : null,
        createdBy: userId,
      });

      return { ok: true as const };
    });

    if ("error" in outcome) return error(outcome.error);
  } catch (cause) {
    if (errorCode(cause) === "23P01") {
      return error("Já existe um agendamento nesse horário para o profissional.");
    }
    if (errorCode(cause) === "42501") {
      return error("Seu papel não permite agendar.");
    }
    return error(String(cause));
  }

  revalidatePath("/appointments");
  return { status: "success", message: "Agendamento criado." };
}

export async function setAppointmentStatusAction(
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as AppointmentStatus;
  if (!UUID_RE.test(id)) return error("Agendamento inválido.");

  const tenant = await getCurrentTenant();
  if (!tenant) return error("Empresa não resolvida.");
  const session = await getSession();
  if (!session?.user) return error("Sessão expirada.");

  try {
    const result = await withUser(session.user.id, async (tx) => {
      const [appointment] = await tx
        .select({ status: appointments.status })
        .from(appointments)
        .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenant.id)))
        .limit(1);
      if (!appointment) return { error: "Agendamento não encontrado." };

      const current = appointment.status as AppointmentStatus;
      if (!ALLOWED_TRANSITIONS[current].includes(status)) {
        return { error: "Transição de status inválida." };
      }

      await tx
        .update(appointments)
        .set({ status })
        .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenant.id)));

      return { ok: true as const };
    });

    if ("error" in result) return error(result.error);
  } catch (cause) {
    return error(String(cause));
  }

  revalidatePath("/appointments");
  return { status: "success", message: "Status atualizado." };
}
