"use server";

import { internalError } from "@/lib/errors";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { clients } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { ClientActionState } from "./types";

const clientInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe ao menos 2 caracteres.")
    .max(120, "No máximo 120 caracteres."),
  email: z
    .string()
    .trim()
    .max(254, "No máximo 254 caracteres.")
    .refine(
      (value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      "E-mail inválido.",
    )
    .optional(),
  phone: z.string().trim().max(40, "No máximo 40 caracteres.").optional(),
  notes: z.string().trim().max(1000, "No máximo 1000 caracteres.").optional(),
});

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

function nullIfEmpty(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

function errorCode(cause: unknown): string | undefined {
  return (cause as { code?: string })?.code;
}

function readInput(formData: FormData) {
  return clientInput.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

async function context() {
  const tenant = await getCurrentTenant();
  if (!tenant) return { error: "Empresa não resolvida." as const };
  const session = await getSession();
  if (!session?.user) return { error: "Sessão expirada." as const };
  return { tenant, userId: session.user.id };
}

export async function createClientAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = readInput(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      await tx.insert(clients).values({
        tenantId: ctx.tenant.id,
        name: parsed.data.name,
        email: nullIfEmpty(parsed.data.email),
        phone: nullIfEmpty(parsed.data.phone),
        notes: nullIfEmpty(parsed.data.notes),
      });
    });
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", fieldErrors: { email: ["Já existe um cliente com esse e-mail."] } };
    }
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite criar clientes." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/clients");
  return { status: "success", message: "Cliente cadastrado." };
}

export async function updateClientAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Cliente inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = readInput(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(clients)
        .set({
          name: parsed.data.name,
          email: nullIfEmpty(parsed.data.email),
          phone: nullIfEmpty(parsed.data.phone),
          notes: nullIfEmpty(parsed.data.notes),
        })
        .where(and(eq(clients.id, id), eq(clients.tenantId, ctx.tenant.id)))
        .returning({ id: clients.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para editar este cliente." };
    }
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", fieldErrors: { email: ["Já existe um cliente com esse e-mail."] } };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/clients");
  return { status: "success", message: "Cliente atualizado." };
}

export async function setClientActiveAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return { status: "error", message: "Cliente inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(clients)
        .set({ isActive })
        .where(and(eq(clients.id, id), eq(clients.tenantId, ctx.tenant.id)))
        .returning({ id: clients.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para alterar este cliente." };
    }
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/clients");
  return { status: "success" };
}
