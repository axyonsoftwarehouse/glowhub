"use server";

import { internalError } from "@/lib/errors";
import { dbErrorCode, overlapMessage } from "@/lib/appointment-errors";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { appointments, clients } from "@/db/schema";
import { computeSlotsForDay } from "@/lib/availability-data";
import { withUser } from "@/lib/db";
import { setAppointmentStatus } from "@/lib/appointment-status";
import { enqueueEmail } from "@/lib/notifications";
import {
  formatReminderWhen,
  reminderDedupeKey,
  reminderScheduledFor,
} from "@/lib/reminders";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { zonedTimeToUtc } from "@/lib/timezone";
import type { AppointmentActionState, AppointmentStatus } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function error(message?: string): AppointmentActionState {
  return { status: "error", message: message ?? "Erro inesperado." };
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
      let clientName = newClientName;
      let clientEmail: string | null = null;
      if (resolvedClientId) {
        const [client] = await tx
          .select({ id: clients.id, name: clients.name, email: clients.email })
          .from(clients)
          .where(and(eq(clients.id, resolvedClientId), eq(clients.tenantId, tenant.id)))
          .limit(1);
        if (!client) return { error: "Cliente não encontrado." };
        clientName = client.name;
        clientEmail = client.email;
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

      const [appointment] = await tx
        .insert(appointments)
        .values({
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
        })
        .returning({ id: appointments.id });

      if (clientEmail) {
        await enqueueEmail(tx, {
          tenantId: tenant.id,
          recipient: clientEmail,
          subject: `Lembrete do seu horário em ${tenant.name}`,
          body: `Olá ${clientName}, seu horário está marcado para ${formatReminderWhen(
            startsAt,
            ctx.timezone,
          )}. Se precisar remarcar, entre em contato com ${tenant.name}.`,
          scheduledFor: reminderScheduledFor(startsAt),
          dedupeKey: reminderDedupeKey(appointment.id),
          createdBy: userId,
        });
      }

      return { ok: true as const };
    });

    if ("error" in outcome) return error(outcome.error);
  } catch (cause) {
    const overlap = overlapMessage(cause);
    if (overlap) return error(overlap);
    if (dbErrorCode(cause) === "42501") {
      return error("Seu papel não permite agendar.");
    }
    return error(internalError(cause));
  }

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  revalidatePath("/my-schedule");
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
    const result = await withUser(session.user.id, (tx) =>
      setAppointmentStatus(tx, {
        tenantId: tenant.id,
        userId: session.user.id,
        appointmentId: id,
        status,
      }),
    );

    if (!result.ok) return error(result.error);
  } catch (cause) {
    return error(overlapMessage(cause) ?? internalError(cause));
  }

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  revalidatePath("/my-schedule");
  return { status: "success", message: "Status atualizado." };
}
