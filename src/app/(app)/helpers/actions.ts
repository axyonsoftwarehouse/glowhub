"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ProfessionalActionState } from "@/app/(app)/professionals/types";
import { checkPlanLimit } from "@/lib/billing/service";
import { dbErrorCode } from "@/lib/db-errors";
import { internalError } from "@/lib/errors";
import { createHelper } from "@/lib/helpers";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";

const helperInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe ao menos 2 caracteres.")
    .max(120, "No máximo 120 caracteres."),
  commission: z.string().trim().optional(),
});

function parseCommissionBp(raw: string | undefined): number | null {
  const cleaned = (raw ?? "").replace("%", "").replace(",", ".").trim();
  if (cleaned === "") return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100);
}

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

async function context() {
  const tenant = await getCurrentTenant();
  if (!tenant) return { error: "Empresa não resolvida." as const };
  const session = await getSession();
  if (!session?.user) return { error: "Sessão expirada." as const };
  return { tenant, userId: session.user.id };
}

export async function createHelperAction(
  _prev: ProfessionalActionState,
  formData: FormData,
): Promise<ProfessionalActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = helperInput.safeParse({
    name: formData.get("name") ?? "",
    commission: formData.get("commission") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const commissionBp = parseCommissionBp(parsed.data.commission);
  if (commissionBp === null) {
    return {
      status: "error",
      fieldErrors: { commission: ["Comissão deve ser entre 0 e 100%."] },
    };
  }

  const limitError = await checkPlanLimit(ctx.tenant, "professionals");
  if (limitError) return { status: "error", message: limitError };

  try {
    await createHelper({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      name: parsed.data.name,
      commissionBp,
    });
  } catch (cause) {
    if (dbErrorCode(cause) === "23505") {
      return {
        status: "error",
        fieldErrors: { name: ["Já existe um profissional com esse nome."] },
      };
    }
    if (dbErrorCode(cause) === "42501") {
      return {
        status: "error",
        message: "Seu papel não permite cadastrar ajudante.",
      };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/helpers");
  revalidatePath("/professionals");
  revalidatePath("/finance");
  return {
    status: "success",
    message: "Ajudante criado com conta própria.",
  };
}
