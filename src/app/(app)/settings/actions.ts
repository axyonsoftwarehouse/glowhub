"use server";

import { internalError } from "@/lib/errors";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { tenants } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { SettingsActionState } from "./types";

const settingsInput = z.object({
  cancellationWindowHours: z.coerce
    .number()
    .int()
    .min(0, "Mínimo 0 hora.")
    .max(168, "Máximo 168 horas (7 dias)."),
  noShowFeePercent: z.coerce
    .number()
    .int()
    .min(0, "Mínimo 0%.")
    .max(100, "Máximo 100%."),
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

export async function updateTenantSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const parsed = settingsInput.safeParse({
    cancellationWindowHours: formData.get("cancellationWindowHours"),
    noShowFeePercent: formData.get("noShowFeePercent"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const tenant = await getCurrentTenant();
  if (!tenant) return { status: "error", message: "Empresa não resolvida." };
  const session = await getSession();
  if (!session?.user) return { status: "error", message: "Sessão expirada." };

  try {
    const updated = await withUser(session.user.id, async (tx) =>
      tx
        .update(tenants)
        .set({
          cancellationWindowHours: parsed.data.cancellationWindowHours,
          noShowFeePercent: parsed.data.noShowFeePercent,
        })
        .where(eq(tenants.id, tenant.id))
        .returning({ id: tenants.id }),
    );
    if (updated.length === 0) {
      return {
        status: "error",
        message: "Seu papel não permite alterar as configurações.",
      };
    }
  } catch (cause) {
    if (errorCode(cause) === "42501") {
      return {
        status: "error",
        message: "Seu papel não permite alterar as configurações.",
      };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/settings");
  return { status: "success", message: "Configurações salvas." };
}
