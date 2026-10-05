"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { appointments, professionals } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
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
        .select({ status: appointments.status })
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

      return { ok: true as const };
    });

    if ("error" in result) return error(result.error ?? "Erro inesperado.");
  } catch (cause) {
    const code = (cause as { code?: string })?.code;
    if (code === "42501") {
      return error("Seu papel não permite alterar o status.");
    }
    return error(String(cause));
  }

  revalidatePath("/my-schedule");
  revalidatePath("/appointments");
  return { status: "success", message: "Status atualizado." };
}
