"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  branchClosures,
  branchHours,
  branches,
  professionalHours,
  professionals,
} from "@/db/schema";
import { timeToMinutes } from "@/lib/availability";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { ScheduleActionState } from "./types";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const hoursInput = z.object({
  ownerType: z.enum(["branch", "professional"]),
  ownerId: z.string().uuid("Registro inválido."),
  intervals: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        start: z.string().regex(TIME_RE, "Horário inválido."),
        end: z.string().regex(TIME_RE, "Horário inválido."),
      }),
    )
    .max(100),
});

const closureInput = z.object({
  branchId: z.string().uuid("Filial inválida."),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  startTime: z.string().regex(TIME_RE, "Horário inválido.").optional(),
  endTime: z.string().regex(TIME_RE, "Horário inválido.").optional(),
  reason: z.string().trim().max(200, "No máximo 200 caracteres.").optional(),
});

function error(message?: string): ScheduleActionState {
  return { status: "error", message: message ?? "Erro inesperado." };
}

async function context() {
  const tenant = await getCurrentTenant();
  if (!tenant) return { error: "Empresa não resolvida." as const };
  const session = await getSession();
  if (!session?.user) return { error: "Sessão expirada." as const };
  return { tenant, userId: session.user.id };
}

export async function saveWeeklyHoursAction(payload: {
  ownerType: "branch" | "professional";
  ownerId: string;
  intervals: { weekday: number; start: string; end: string }[];
}): Promise<ScheduleActionState> {
  const parsed = hoursInput.safeParse(payload);
  if (!parsed.success) return error("Horários inválidos.");

  for (const interval of parsed.data.intervals) {
    if (timeToMinutes(interval.end) <= timeToMinutes(interval.start)) {
      return error("O fim do intervalo deve ser após o início.");
    }
  }

  const ctx = await context();
  if ("error" in ctx) return error(ctx.error);

  const isBranch = parsed.data.ownerType === "branch";

  try {
    await withUser(ctx.userId, async (tx) => {
      const ownerTable = isBranch ? branches : professionals;
      const [owner] = await tx
        .select({ id: ownerTable.id })
        .from(ownerTable)
        .where(
          and(
            eq(ownerTable.id, parsed.data.ownerId),
            eq(ownerTable.tenantId, ctx.tenant.id),
          ),
        )
        .limit(1);
      if (!owner) throw new Error("Filial ou profissional não encontrado.");

      if (isBranch) {
        await tx
          .delete(branchHours)
          .where(
            and(
              eq(branchHours.tenantId, ctx.tenant.id),
              eq(branchHours.branchId, parsed.data.ownerId),
            ),
          );
        if (parsed.data.intervals.length > 0) {
          await tx.insert(branchHours).values(
            parsed.data.intervals.map((interval) => ({
              tenantId: ctx.tenant.id,
              branchId: parsed.data.ownerId,
              weekday: interval.weekday,
              startTime: `${interval.start}:00`,
              endTime: `${interval.end}:00`,
            })),
          );
        }
      } else {
        await tx
          .delete(professionalHours)
          .where(
            and(
              eq(professionalHours.tenantId, ctx.tenant.id),
              eq(professionalHours.professionalId, parsed.data.ownerId),
            ),
          );
        if (parsed.data.intervals.length > 0) {
          await tx.insert(professionalHours).values(
            parsed.data.intervals.map((interval) => ({
              tenantId: ctx.tenant.id,
              professionalId: parsed.data.ownerId,
              weekday: interval.weekday,
              startTime: `${interval.start}:00`,
              endTime: `${interval.end}:00`,
            })),
          );
        }
      }
    });
  } catch (cause) {
    return error(String(cause));
  }

  revalidatePath("/schedule");
  return { status: "success", message: "Horários salvos." };
}

export async function addClosureAction(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const hasStart = String(formData.get("startTime") ?? "") !== "";
  const hasEnd = String(formData.get("endTime") ?? "") !== "";

  const parsed = closureInput.safeParse({
    branchId: formData.get("branchId") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    startTime: hasStart ? formData.get("startTime") : undefined,
    endTime: hasEnd ? formData.get("endTime") : undefined,
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return error("Preencha corretamente os campos.");

  if (hasStart !== hasEnd) {
    return error("Informe início e fim, ou deixe os dois vazios para o dia inteiro.");
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return error("A data final deve ser igual ou posterior à inicial.");
  }
  if (
    parsed.data.startTime &&
    parsed.data.endTime &&
    timeToMinutes(parsed.data.endTime) <= timeToMinutes(parsed.data.startTime)
  ) {
    return error("O fim do bloqueio deve ser após o início.");
  }

  const ctx = await context();
  if ("error" in ctx) return error(ctx.error);

  try {
    await withUser(ctx.userId, async (tx) => {
      const [branch] = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(
          and(
            eq(branches.id, parsed.data.branchId),
            eq(branches.tenantId, ctx.tenant.id),
          ),
        )
        .limit(1);
      if (!branch) throw new Error("Filial não encontrada.");

      await tx.insert(branchClosures).values({
        tenantId: ctx.tenant.id,
        branchId: parsed.data.branchId,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        startTime: parsed.data.startTime ? `${parsed.data.startTime}:00` : null,
        endTime: parsed.data.endTime ? `${parsed.data.endTime}:00` : null,
        reason:
          parsed.data.reason && parsed.data.reason.length > 0
            ? parsed.data.reason
            : null,
      });
    });
  } catch (cause) {
    return error(String(cause));
  }

  revalidatePath("/schedule");
  return { status: "success", message: "Bloqueio adicionado." };
}

export async function removeClosureAction(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return error("Bloqueio inválido.");

  const ctx = await context();
  if ("error" in ctx) return error(ctx.error);

  try {
    const removed = await withUser(ctx.userId, async (tx) =>
      tx
        .delete(branchClosures)
        .where(
          and(
            eq(branchClosures.id, id),
            eq(branchClosures.tenantId, ctx.tenant.id),
          ),
        )
        .returning({ id: branchClosures.id }),
    );
    if (removed.length === 0) return error("Bloqueio não encontrado.");
  } catch (cause) {
    return error(String(cause));
  }

  revalidatePath("/schedule");
  return { status: "success", message: "Bloqueio removido." };
}
