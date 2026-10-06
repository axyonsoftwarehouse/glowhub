"use server";

import { internalError } from "@/lib/errors";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { branches } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { BranchActionState } from "./types";

const branchInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe ao menos 2 caracteres.")
    .max(120, "No máximo 120 caracteres."),
  slug: z
    .string()
    .trim()
    .min(2, "Informe um identificador.")
    .max(60, "No máximo 60 caracteres.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use apenas letras minúsculas, números e hífens.",
    ),
  address: z.string().trim().max(200, "No máximo 200 caracteres.").optional(),
  timezone: z.string().trim().min(1, "Selecione o fuso horário.").max(64),
});

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

function readInput(formData: FormData) {
  return branchInput.safeParse({
    name: formData.get("name") ?? "",
    slug: formData.get("slug") ?? "",
    address: formData.get("address") ?? "",
    timezone: formData.get("timezone") ?? "",
  });
}

function normalizeAddress(address: string | undefined): string | null {
  return address && address.length > 0 ? address : null;
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

export async function createBranchAction(
  _prev: BranchActionState,
  formData: FormData,
): Promise<BranchActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = readInput(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      await tx.insert(branches).values({
        tenantId: ctx.tenant.id,
        name: parsed.data.name,
        slug: parsed.data.slug,
        address: normalizeAddress(parsed.data.address),
        timezone: parsed.data.timezone,
      });
    });
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return {
        status: "error",
        fieldErrors: { slug: ["Já existe uma filial com este identificador."] },
      };
    }
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite criar filiais." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/branches");
  revalidatePath("/dashboard");
  return { status: "success", message: "Filial criada." };
}

export async function updateBranchAction(
  _prev: BranchActionState,
  formData: FormData,
): Promise<BranchActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Filial inválida." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = readInput(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(branches)
        .set({
          name: parsed.data.name,
          slug: parsed.data.slug,
          address: normalizeAddress(parsed.data.address),
          timezone: parsed.data.timezone,
        })
        .where(
          and(eq(branches.id, id), eq(branches.tenantId, ctx.tenant.id)),
        )
        .returning({ id: branches.id }),
    );

    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para editar esta filial." };
    }
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return {
        status: "error",
        fieldErrors: { slug: ["Já existe uma filial com este identificador."] },
      };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/branches");
  revalidatePath("/dashboard");
  return { status: "success", message: "Filial atualizada." };
}

export async function setBranchActiveAction(
  _prev: BranchActionState,
  formData: FormData,
): Promise<BranchActionState> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return { status: "error", message: "Filial inválida." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(branches)
        .set({ isActive })
        .where(and(eq(branches.id, id), eq(branches.tenantId, ctx.tenant.id)))
        .returning({ id: branches.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para alterar esta filial." };
    }
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/branches");
  revalidatePath("/dashboard");
  return {
    status: "success",
    message: isActive ? "Filial ativada." : "Filial desativada.",
  };
}
