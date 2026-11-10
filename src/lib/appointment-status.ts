import { and, eq } from "drizzle-orm";
import {
  appointments,
  memberships,
  notifications,
  tenants,
} from "@/db/schema";
import type { AppTx } from "@/lib/db";
import { applyNoShowFee } from "@/lib/no-show-fee";
import { reminderDedupeKey } from "@/lib/reminders";
import {
  isWithinCancellationWindow,
  OVERRIDE_ROLES,
} from "@/lib/tenant-policy";
import {
  ALLOWED_TRANSITIONS,
  type AppointmentStatus,
} from "@/app/(app)/appointments/types";

export type StatusUpdateCode =
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "CANCELLATION_WINDOW"
  | "FORBIDDEN"
  | "UNKNOWN";

export type StatusUpdateResult =
  | { ok: true; status: AppointmentStatus }
  | { ok: false; error: string; code: StatusUpdateCode };

/**
 * Núcleo da mudança de status do agendamento, compartilhado entre a Server
 * Action do painel e a API do app. Aplica transições permitidas, janela de
 * cancelamento por papel, remoção de lembrete pendente e taxa de no-show.
 */
export async function setAppointmentStatus(
  tx: AppTx,
  params: {
    tenantId: string;
    userId: string;
    appointmentId: string;
    status: AppointmentStatus;
  },
): Promise<StatusUpdateResult> {
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
    .where(
      and(
        eq(appointments.id, params.appointmentId),
        eq(appointments.tenantId, params.tenantId),
      ),
    )
    .limit(1);
  if (!appointment) {
    return {
      ok: false,
      error: "Agendamento não encontrado.",
      code: "NOT_FOUND",
    };
  }

  const current = appointment.status as AppointmentStatus;
  if (!ALLOWED_TRANSITIONS[current].includes(params.status)) {
    return {
      ok: false,
      error: "Transição de status inválida.",
      code: "INVALID_TRANSITION",
    };
  }

  const [policy] = await tx
    .select({
      cancellationWindowHours: tenants.cancellationWindowHours,
      noShowFeePercent: tenants.noShowFeePercent,
    })
    .from(tenants)
    .where(eq(tenants.id, params.tenantId))
    .limit(1);
  const windowHours = policy?.cancellationWindowHours ?? 0;

  if (
    params.status === "cancelled" &&
    isWithinCancellationWindow(appointment.startsAt, windowHours)
  ) {
    const [membership] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, params.tenantId),
          eq(memberships.userId, params.userId),
        ),
      )
      .limit(1);
    if (!OVERRIDE_ROLES.includes(membership?.role ?? "")) {
      return {
        ok: false,
        error: `Cancelamento dentro da janela mínima de ${windowHours}h. Peça a um gerente.`,
        code: "CANCELLATION_WINDOW",
      };
    }
  }

  const updated = await tx
    .update(appointments)
    .set({ status: params.status })
    .where(
      and(
        eq(appointments.id, params.appointmentId),
        eq(appointments.tenantId, params.tenantId),
      ),
    )
    .returning({ id: appointments.id });
  if (updated.length === 0) {
    return {
      ok: false,
      error: "Seu papel não permite alterar este agendamento.",
      code: "FORBIDDEN",
    };
  }

  if (params.status === "cancelled" || params.status === "no_show") {
    await tx
      .delete(notifications)
      .where(
        and(
          eq(notifications.tenantId, params.tenantId),
          eq(notifications.dedupeKey, reminderDedupeKey(appointment.id)),
          eq(notifications.status, "pending"),
        ),
      );
  }

  if (params.status === "no_show") {
    await applyNoShowFee(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      serviceId: appointment.serviceId,
      priceCents: appointment.priceCents,
      percent: policy?.noShowFeePercent ?? 0,
    });
  }

  return { ok: true, status: params.status };
}
