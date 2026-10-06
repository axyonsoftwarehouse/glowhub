"use server";

import { internalError } from "@/lib/errors";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { branches, categories, serviceBranches, services } from "@/db/schema";
import { parsePriceToCents } from "@/lib/money";
import { withUser, type AppTx } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { CatalogActionState } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const categoryInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe ao menos 2 caracteres.")
    .max(80, "No máximo 80 caracteres."),
  kind: z.enum(["service", "product"]).default("service"),
});

const serviceInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe ao menos 2 caracteres.")
    .max(120, "No máximo 120 caracteres."),
  description: z.string().trim().max(1000, "No máximo 1000 caracteres.").optional(),
  durationMinutes: z.coerce
    .number()
    .int("Use minutos inteiros.")
    .min(1, "Duração mínima de 1 minuto.")
    .max(1440, "Duração máxima de 24 horas."),
  price: z.string().trim(),
  categoryId: z
    .string()
    .trim()
    .refine((value) => value === "" || UUID_RE.test(value), "Categoria inválida.")
    .optional(),
  imageUrl: z
    .string()
    .trim()
    .max(500, "No máximo 500 caracteres.")
    .refine(
      (value) => value === "" || /^https?:\/\/\S+$/i.test(value),
      "Informe uma URL http(s) válida.",
    )
    .optional(),
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

async function context() {
  const tenant = await getCurrentTenant();
  if (!tenant) return { error: "Empresa não resolvida." as const };
  const session = await getSession();
  if (!session?.user) return { error: "Sessão expirada." as const };
  return { tenant, userId: session.user.id };
}

function readServiceInput(formData: FormData) {
  return serviceInput.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    durationMinutes: formData.get("durationMinutes") ?? "",
    price: formData.get("price") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
  });
}

async function resolveCategoryId(
  tx: AppTx,
  tenantId: string,
  categoryId: string | undefined,
): Promise<{ id: string | null } | { error: string }> {
  if (!categoryId) return { id: null };
  const [row] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.tenantId, tenantId),
        eq(categories.kind, "service"),
      ),
    )
    .limit(1);
  if (!row) return { error: "Categoria não encontrada." };
  return { id: categoryId };
}

export async function createCategoryAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = categoryInput.safeParse({
    name: formData.get("name") ?? "",
    kind: formData.get("kind") ?? "service",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      await tx.insert(categories).values({
        tenantId: ctx.tenant.id,
        kind: parsed.data.kind,
        name: parsed.data.name,
      });
    });
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", message: "Já existe uma categoria com esse nome." };
    }
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite criar categorias." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/services");
  revalidatePath("/products");
  return { status: "success", message: "Categoria criada." };
}

export async function setCategoryActiveAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return { status: "error", message: "Categoria inválida." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(categories)
        .set({ isActive })
        .where(
          and(eq(categories.id, id), eq(categories.tenantId, ctx.tenant.id)),
        )
        .returning({ id: categories.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para alterar a categoria." };
    }
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/services");
  revalidatePath("/products");
  return { status: "success" };
}

export async function createServiceAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = readServiceInput(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const priceCents = parsePriceToCents(parsed.data.price);
  if (priceCents === null) {
    return { status: "error", fieldErrors: { price: ["Preço inválido."] } };
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      const category = await resolveCategoryId(tx, ctx.tenant.id, parsed.data.categoryId);
      if ("error" in category) throw new Error(category.error);

      await tx.insert(services).values({
        tenantId: ctx.tenant.id,
        categoryId: category.id,
        name: parsed.data.name,
        description: nullIfEmpty(parsed.data.description),
        durationMinutes: parsed.data.durationMinutes,
        priceCents,
        imageUrl: nullIfEmpty(parsed.data.imageUrl),
      });
    });
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", fieldErrors: { name: ["Já existe um serviço com esse nome."] } };
    }
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite criar serviços." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/services");
  return { status: "success", message: "Serviço criado." };
}

export async function updateServiceAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Serviço inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = readServiceInput(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const priceCents = parsePriceToCents(parsed.data.price);
  if (priceCents === null) {
    return { status: "error", fieldErrors: { price: ["Preço inválido."] } };
  }

  try {
    const updated = await withUser(ctx.userId, async (tx) => {
      const category = await resolveCategoryId(tx, ctx.tenant.id, parsed.data.categoryId);
      if ("error" in category) throw new Error(category.error);

      return tx
        .update(services)
        .set({
          categoryId: category.id,
          name: parsed.data.name,
          description: nullIfEmpty(parsed.data.description),
          durationMinutes: parsed.data.durationMinutes,
          priceCents,
          imageUrl: nullIfEmpty(parsed.data.imageUrl),
        })
        .where(and(eq(services.id, id), eq(services.tenantId, ctx.tenant.id)))
        .returning({ id: services.id });
    });

    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para editar este serviço." };
    }
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", fieldErrors: { name: ["Já existe um serviço com esse nome."] } };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/services");
  return { status: "success", message: "Serviço atualizado." };
}

export async function setServiceActiveAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return { status: "error", message: "Serviço inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(services)
        .set({ isActive })
        .where(and(eq(services.id, id), eq(services.tenantId, ctx.tenant.id)))
        .returning({ id: services.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para alterar o serviço." };
    }
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/services");
  return { status: "success" };
}

export async function upsertServiceBranchAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const serviceId = String(formData.get("serviceId") ?? "");
  const branchId = String(formData.get("branchId") ?? "");
  if (!serviceId || !branchId) {
    return { status: "error", message: "Dados incompletos." };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const priceRaw = String(formData.get("price") ?? "").trim();
  const durationRaw = String(formData.get("durationMinutes") ?? "").trim();
  const isActive = String(formData.get("offer") ?? "") === "on";

  let priceCents: number | null = null;
  if (priceRaw !== "") {
    const parsed = parsePriceToCents(priceRaw);
    if (parsed === null) {
      return { status: "error", fieldErrors: { price: ["Preço inválido."] } };
    }
    priceCents = parsed;
  }

  let durationMinutes: number | null = null;
  if (durationRaw !== "") {
    const parsed = Number(durationRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1440) {
      return {
        status: "error",
        fieldErrors: { durationMinutes: ["Duração entre 1 e 1440 minutos."] },
      };
    }
    durationMinutes = parsed;
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      const [service] = await tx
        .select({ id: services.id })
        .from(services)
        .where(and(eq(services.id, serviceId), eq(services.tenantId, ctx.tenant.id)))
        .limit(1);
      const [branch] = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(and(eq(branches.id, branchId), eq(branches.tenantId, ctx.tenant.id)))
        .limit(1);
      if (!service || !branch) throw new Error("Serviço ou filial inválidos.");

      if (isActive && priceCents === null && durationMinutes === null) {
        await tx
          .delete(serviceBranches)
          .where(
            and(
              eq(serviceBranches.serviceId, serviceId),
              eq(serviceBranches.branchId, branchId),
              eq(serviceBranches.tenantId, ctx.tenant.id),
            ),
          );
        return;
      }

      await tx
        .insert(serviceBranches)
        .values({
          tenantId: ctx.tenant.id,
          serviceId,
          branchId,
          priceCents,
          durationMinutes,
          isActive,
        })
        .onConflictDoUpdate({
          target: [serviceBranches.serviceId, serviceBranches.branchId],
          set: { priceCents, durationMinutes, isActive },
        });
    });
  } catch (cause) {
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite alterar." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/services");
  return {
    status: "success",
    message: isActive ? "Override salvo." : "Serviço desativado nesta filial.",
  };
}
