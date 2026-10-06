"use server";

import { internalError } from "@/lib/errors";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { appointments, clients, memberships, tenants } from "@/db/schema";
import { computeSlotsForDay } from "@/lib/availability-data";
import { withUser } from "@/lib/db";
import { applyNoShowFee } from "@/lib/no-show-fee";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import {
  isWithinCancellationWindow,
  OVERRIDE_ROLES,
} from "@/lib/tenant-policy";
import { zonedTimeToUtc } from "@/lib/timezone";
import {
  ALLOWED_TRANSITIONS,
  type AppointmentActionState,
  type AppointmentStatus,
} from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function error(message?: string): AppointmentActionState {
  return { status: "error", message: message ?? "Erro inesperado." };
}

function errorCode(cause: unknown): string | undefined {
  return (cause as { code?: string })?.code;
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
    return error(internalError(cause));
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
        .select({
          id: appointments.id,
          status: appointments.status,
          startsAt: appointments.startsAt,
          clientId: appointments.clientId,
          serviceId: appointments.serviceId,
          priceCents: appointments.priceCents,
        })
        .from(appointments)
        .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenant.id)))
        .limit(1);
      if (!appointment) return { error: "Agendamento não encontrado." };

      const current = appointment.status as AppointmentStatus;
      if (!ALLOWED_TRANSITIONS[current].includes(status)) {
        return { error: "Transição de status inválida." };
      }

      const [policy] = await tx
        .select({
          cancellationWindowHours: tenants.cancellationWindowHours,
          noShowFeePercent: tenants.noShowFeePercent,
        })
        .from(tenants)
        .where(eq(tenants.id, tenant.id))
        .limit(1);
      const windowHours = policy?.cancellationWindowHours ?? 0;

      if (
        status === "cancelled" &&
        isWithinCancellationWindow(appointment.startsAt, windowHours)
      ) {
        const [membership] = await tx
          .select({ role: memberships.role })
          .from(memberships)
          .where(
            and(
              eq(memberships.tenantId, tenant.id),
              eq(memberships.userId, session.user.id),
            ),
          )
          .limit(1);
        if (!OVERRIDE_ROLES.includes(membership?.role ?? "")) {
          return {
            error: `Cancelamento dentro da janela mínima de ${windowHours}h. Peça a um gerente.`,
          };
        }
      }

      await tx
        .update(appointments)
        .set({ status })
        .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenant.id)));

      if (status === "no_show") {
        await applyNoShowFee(tx, {
          tenantId: tenant.id,
          userId: session.user.id,
          appointmentId: appointment.id,
          clientId: appointment.clientId,
          serviceId: appointment.serviceId,
          priceCents: appointment.priceCents,
          percent: policy?.noShowFeePercent ?? 0,
        });
      }

      return { ok: true as const };
    });

    if ("error" in result) return error(result.error);
  } catch (cause) {
    return error(internalError(cause));
  }

  revalidatePath("/appointments");
  return { status: "success", message: "Status atualizado." };
}
