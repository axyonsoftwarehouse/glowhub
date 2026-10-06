"use server";

import { internalError } from "@/lib/errors";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import {
  appointments,
  memberships,
  professionals,
  tenants,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { applyNoShowFee } from "@/lib/no-show-fee";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import {
  isWithinCancellationWindow,
  OVERRIDE_ROLES,
} from "@/lib/tenant-policy";
import {
  ALLOWED_TRANSITIONS,
  type AppointmentActionState,
  type AppointmentStatus,
} from "@/app/(app)/appointments/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUSES: AppointmentStatus[] = [
  "pending",
  "confirmed",
  "check_in",
  "checkout",
  "completed",
  "cancelled",
  "no_show",
];

function error(message: string): AppointmentActionState {
  return { status: "error", message };
}

export async function setMyAppointmentStatusAction(
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as AppointmentStatus;

  if (!UUID_RE.test(id)) return error("Agendamento inválido.");
  if (!STATUSES.includes(status)) return error("Status inválido.");

  const tenant = await getCurrentTenant();
  if (!tenant) return error("Empresa não resolvida.");
  const session = await getSession();
  if (!session?.user) return error("Sessão expirada.");
  const userId = session.user.id;

  try {
    const result = await withUser(userId, async (tx) => {
      const [professional] = await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          and(
            eq(professionals.tenantId, tenant.id),
            eq(professionals.userId, userId),
          ),
        )
        .limit(1);
      if (!professional) {
        return { error: "Seu acesso não está vinculado a um profissional." };
      }

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
            eq(appointments.id, id),
            eq(appointments.tenantId, tenant.id),
            eq(appointments.professionalId, professional.id),
          ),
        )
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
              eq(memberships.userId, userId),
            ),
          )
          .limit(1);
        if (!OVERRIDE_ROLES.includes(membership?.role ?? "")) {
          return {
            error: `Cancelamento dentro da janela mínima de ${windowHours}h. Peça a um gerente.`,
          };
        }
      }

      const updated = await tx
        .update(appointments)
        .set({ status })
        .where(
          and(
            eq(appointments.id, id),
            eq(appointments.tenantId, tenant.id),
            eq(appointments.professionalId, professional.id),
          ),
        )
        .returning({ id: appointments.id });
      if (updated.length === 0) {
        return { error: "Sem permissão para alterar este agendamento." };
      }

      if (status === "no_show") {
        await applyNoShowFee(tx, {
          tenantId: tenant.id,
          userId,
          appointmentId: appointment.id,
          clientId: appointment.clientId,
          serviceId: appointment.serviceId,
          priceCents: appointment.priceCents,
          percent: policy?.noShowFeePercent ?? 0,
        });
      }

      return { ok: true as const };
    });

    if ("error" in result) return error(result.error ?? "Erro inesperado.");
  } catch (cause) {
    const code = (cause as { code?: string })?.code;
    if (code === "42501") {
      return error("Seu papel não permite alterar o status.");
    }
    return error(internalError(cause));
  }

  revalidatePath("/my-schedule");
  revalidatePath("/appointments");
  return { status: "success", message: "Status atualizado." };
}
