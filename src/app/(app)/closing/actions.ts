"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { accountingPeriods, memberships } from "@/db/schema";
import {
  computeTrialBalance,
  type TrialBalanceRow,
} from "@/lib/accounting";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { ClosingActionState } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLOSE_ROLES = ["owner", "admin"];

const periodInput = z.object({
  periodStart: z.string().regex(DATE_RE, "Data inicial inválida."),
  periodEnd: z.string().regex(DATE_RE, "Data final inválida."),
});

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

function errorCode(cause: unknown): string | undefined {
  return (cause as { code?: string })?.code;
}

async function context() {
  const tenant = await getCurrentTenant();
  if (!tenant) return { error: "Empresa não resolvida." as const };
  const session = await getSession();
  if (!session?.user) return { error: "Sessão expirada." as const };
  return { tenant, userId: session.user.id };
}

export async function closePeriodAction(
  _prev: ClosingActionState,
  formData: FormData,
): Promise<ClosingActionState> {
  const parsed = periodInput.safeParse({
    periodStart: formData.get("periodStart") ?? "",
    periodEnd: formData.get("periodEnd") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const { periodStart, periodEnd } = parsed.data;
  if (periodEnd < periodStart) {
    return {
      status: "error",
      fieldErrors: { periodEnd: ["A data final deve ser após a inicial."] },
    };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const from = new Date(`${periodStart}T00:00:00.000Z`);
  const to = new Date(`${periodEnd}T23:59:59.999Z`);

  try {
    const result = await withUser(ctx.userId, async (tx) => {
      const [membership] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.tenantId, ctx.tenant.id),
            eq(memberships.userId, ctx.userId),
          ),
        )
        .limit(1);
      if (!CLOSE_ROLES.includes(membership?.role ?? "")) {
        return { error: "Apenas proprietários e administradores podem fechar períodos." };
      }

      const overlapping = await tx
        .select({ id: accountingPeriods.id })
        .from(accountingPeriods)
        .where(
          and(
            eq(accountingPeriods.tenantId, ctx.tenant.id),
            eq(accountingPeriods.status, "closed"),
            lte(accountingPeriods.periodStart, periodEnd),
            gte(accountingPeriods.periodEnd, periodStart),
          ),
        )
        .limit(1);
      if (overlapping.length > 0) {
        return { error: "Já existe um período fechado em conflito com esse intervalo." };
      }

      const rows = await computeTrialBalance(tx, ctx.tenant.id, from, to);

      await tx
        .insert(accountingPeriods)
        .values({
          tenantId: ctx.tenant.id,
          periodStart,
          periodEnd,
          status: "closed",
          snapshot: rows as unknown as TrialBalanceRow[],
          closedAt: new Date(),
          closedBy: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [
            accountingPeriods.tenantId,
            accountingPeriods.periodStart,
            accountingPeriods.periodEnd,
          ],
          set: {
            status: "closed",
            snapshot: rows as unknown as TrialBalanceRow[],
            closedAt: new Date(),
            closedBy: ctx.userId,
            reopenedAt: null,
          },
        });

      return { ok: true as const };
    });

    if ("error" in result) return { status: "error", message: result.error };
  } catch (cause) {
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite fechar períodos." };
    }
    return { status: "error", message: String(cause) };
  }

  revalidatePath("/closing");
  revalidatePath("/reports");
  return { status: "success", message: "Período fechado." };
}

export async function reopenPeriodAction(
  _prev: ClosingActionState,
  formData: FormData,
): Promise<ClosingActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Período inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(accountingPeriods)
        .set({ status: "open", reopenedAt: new Date() })
        .where(
          and(
            eq(accountingPeriods.id, id),
            eq(accountingPeriods.tenantId, ctx.tenant.id),
          ),
        )
        .returning({ id: accountingPeriods.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para reabrir o período." };
    }
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }

  revalidatePath("/closing");
  return { status: "success", message: "Período reaberto." };
}
