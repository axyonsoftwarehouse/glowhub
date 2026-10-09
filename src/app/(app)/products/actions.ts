"use server";

import { isUuid } from "@/lib/validation";

import { internalError } from "@/lib/errors";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { categories, productVariants, products } from "@/db/schema";
import { parsePriceToCents } from "@/lib/money";
import { withUser, type AppTx } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { ProductActionState } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const productBase = {
  name: z
    .string()
    .trim()
    .min(2, "Informe ao menos 2 caracteres.")
    .max(120, "No máximo 120 caracteres."),
  description: z.string().trim().max(1000, "No máximo 1000 caracteres.").optional(),
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
  kind: z.enum(["resale", "internal"]),
};

const productInput = z.object(productBase);
const createProductInput = z.object({
  ...productBase,
  variantName: z.string().trim().max(80, "No máximo 80 caracteres.").optional(),
  variantUnit: z.string().trim().max(10, "No máximo 10 caracteres.").optional(),
  price: z.string().trim(),
  cost: z.string().trim().optional(),
  stock: z.string().trim(),
  minStock: z.string().trim().optional(),
});

const variantInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da variação.")
    .max(80, "No máximo 80 caracteres."),
  sku: z.string().trim().max(60, "No máximo 60 caracteres.").optional(),
  unit: z.string().trim().max(10, "No máximo 10 caracteres.").optional(),
  price: z.string().trim(),
  cost: z.string().trim().optional(),
  stock: z.string().trim(),
  minStock: z.string().trim().optional(),
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

function parseStock(raw: string): number | null {
  if (raw === "") return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
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

async function resolveProductCategoryId(
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
        eq(categories.kind, "product"),
      ),
    )
    .limit(1);
  if (!row) return { error: "Categoria não encontrada." };
  return { id: categoryId };
}

type VariantParse =
  | {
      data: {
        name: string;
        sku: string | null;
        unit: string;
        priceCents: number;
        costCents: number;
        stock: number;
        minStock: number;
      };
    }
  | { error: Record<string, string[]> };

function readVariant(formData: FormData): VariantParse {
  const parsed = variantInput.safeParse({
    name: formData.get("variantName") ?? formData.get("name") ?? "",
    sku: formData.get("sku") ?? "",
    unit: formData.get("unit") ?? "",
    price: formData.get("price") ?? "",
    cost: formData.get("cost") ?? "",
    stock: formData.get("stock") ?? "",
    minStock: formData.get("minStock") ?? "",
  });
  if (!parsed.success) return { error: toFieldErrors(parsed.error) };

  const priceCents = parsePriceToCents(parsed.data.price);
  if (priceCents === null) return { error: { price: ["Preço inválido."] } };

  const costCents = parsePriceToCents(parsed.data.cost ?? "");
  if (costCents === null) return { error: { cost: ["Custo inválido."] } };

  const stock = parseStock(parsed.data.stock);
  if (stock === null) return { error: { stock: ["Estoque inválido."] } };

  const minStock = parseStock(parsed.data.minStock ?? "");
  if (minStock === null) return { error: { minStock: ["Mínimo inválido."] } };

  return {
    data: {
      name: parsed.data.name,
      sku: nullIfEmpty(parsed.data.sku),
      unit: nullIfEmpty(parsed.data.unit) ?? "un",
      priceCents,
      costCents,
      stock,
      minStock,
    },
  };
}

export async function createProductAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = createProductInput.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
    kind: formData.get("kind") ?? "resale",
    variantName: formData.get("variantName") ?? "",
    variantUnit: formData.get("variantUnit") ?? "",
    price: formData.get("price") ?? "",
    cost: formData.get("cost") ?? "",
    stock: formData.get("stock") ?? "",
    minStock: formData.get("minStock") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const priceCents = parsePriceToCents(parsed.data.price);
  if (priceCents === null) {
    return { status: "error", fieldErrors: { price: ["Preço inválido."] } };
  }
  const costCents = parsePriceToCents(parsed.data.cost ?? "");
  if (costCents === null) {
    return { status: "error", fieldErrors: { cost: ["Custo inválido."] } };
  }
  const stock = parseStock(parsed.data.stock);
  if (stock === null) {
    return { status: "error", fieldErrors: { stock: ["Estoque inválido."] } };
  }
  const minStock = parseStock(parsed.data.minStock ?? "");
  if (minStock === null) {
    return { status: "error", fieldErrors: { minStock: ["Mínimo inválido."] } };
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      const category = await resolveProductCategoryId(
        tx,
        ctx.tenant.id,
        parsed.data.categoryId,
      );
      if ("error" in category) throw new Error(category.error);

      const [product] = await tx
        .insert(products)
        .values({
          tenantId: ctx.tenant.id,
          categoryId: category.id,
          name: parsed.data.name,
          description: nullIfEmpty(parsed.data.description),
          imageUrl: nullIfEmpty(parsed.data.imageUrl),
          kind: parsed.data.kind,
        })
        .returning({ id: products.id });

      await tx.insert(productVariants).values({
        tenantId: ctx.tenant.id,
        productId: product.id,
        name: nullIfEmpty(parsed.data.variantName) ?? "Padrão",
        unit: nullIfEmpty(parsed.data.variantUnit) ?? "un",
        priceCents,
        costCents,
        stockQuantity: stock,
        minStock,
      });
    });
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", message: "Já existe um produto ou variação com esse nome." };
    }
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite criar produtos." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/products");
  return { status: "success", message: "Produto criado." };
}

export async function updateProductAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { status: "error", message: "Produto inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = productInput.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
    kind: formData.get("kind") ?? "resale",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const updated = await withUser(ctx.userId, async (tx) => {
      const category = await resolveProductCategoryId(
        tx,
        ctx.tenant.id,
        parsed.data.categoryId,
      );
      if ("error" in category) throw new Error(category.error);

      return tx
        .update(products)
        .set({
          categoryId: category.id,
          name: parsed.data.name,
          description: nullIfEmpty(parsed.data.description),
          imageUrl: nullIfEmpty(parsed.data.imageUrl),
          kind: parsed.data.kind,
        })
        .where(and(eq(products.id, id), eq(products.tenantId, ctx.tenant.id)))
        .returning({ id: products.id });
    });

    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para editar este produto." };
    }
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", fieldErrors: { name: ["Já existe um produto com esse nome."] } };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/products");
  return { status: "success", message: "Produto atualizado." };
}

export async function setProductActiveAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!isUuid(id)) return { status: "error", message: "Produto inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(products)
        .set({ isActive })
        .where(and(eq(products.id, id), eq(products.tenantId, ctx.tenant.id)))
        .returning({ id: products.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para alterar este produto." };
    }
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/products");
  return { status: "success" };
}

export async function createVariantAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const productId = String(formData.get("productId") ?? "");
  if (!isUuid(productId)) return { status: "error", message: "Produto inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const variant = readVariant(formData);
  if ("error" in variant) {
    return { status: "error", fieldErrors: variant.error };
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(eq(products.id, productId), eq(products.tenantId, ctx.tenant.id)),
        )
        .limit(1);
      if (!product) throw new Error("Produto não encontrado.");

      await tx.insert(productVariants).values({
        tenantId: ctx.tenant.id,
        productId,
        name: variant.data.name,
        sku: variant.data.sku,
        unit: variant.data.unit,
        priceCents: variant.data.priceCents,
        costCents: variant.data.costCents,
        stockQuantity: variant.data.stock,
        minStock: variant.data.minStock,
      });
    });
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", message: "Já existe uma variação com esse nome ou SKU." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/products");
  return { status: "success", message: "Variação adicionada." };
}

export async function updateVariantAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { status: "error", message: "Variação inválida." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const variant = readVariant(formData);
  if ("error" in variant) {
    return { status: "error", fieldErrors: variant.error };
  }

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(productVariants)
        .set({
          name: variant.data.name,
          sku: variant.data.sku,
          unit: variant.data.unit,
          priceCents: variant.data.priceCents,
          costCents: variant.data.costCents,
          stockQuantity: variant.data.stock,
          minStock: variant.data.minStock,
        })
        .where(
          and(
            eq(productVariants.id, id),
            eq(productVariants.tenantId, ctx.tenant.id),
          ),
        )
        .returning({ id: productVariants.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para editar esta variação." };
    }
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", message: "Já existe uma variação com esse nome ou SKU." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/products");
  return { status: "success", message: "Variação atualizada." };
}

export async function setVariantActiveAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!isUuid(id)) return { status: "error", message: "Variação inválida." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(productVariants)
        .set({ isActive })
        .where(
          and(
            eq(productVariants.id, id),
            eq(productVariants.tenantId, ctx.tenant.id),
          ),
        )
        .returning({ id: productVariants.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para alterar esta variação." };
    }
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/products");
  return { status: "success" };
}
