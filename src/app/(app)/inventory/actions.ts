"use server";

import { isUuid } from "@/lib/validation";
import { internalError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { productVariants, suppliers } from "@/db/schema";
import { withUser } from "@/lib/db";
import { parsePriceToCents } from "@/lib/money";
import { recordAdjustment, recordPurchase } from "@/lib/inventory";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { InventoryActionState } from "./types";

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

const supplierInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe ao menos 2 caracteres.")
    .max(120, "No máximo 120 caracteres."),
  contact: z.string().trim().max(200, "No máximo 200 caracteres.").optional(),
  notes: z.string().trim().max(1000, "No máximo 1000 caracteres.").optional(),
});

export async function createSupplierAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = supplierInput.safeParse({
    name: formData.get("name") ?? "",
    contact: formData.get("contact") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      await tx.insert(suppliers).values({
        tenantId: ctx.tenant.id,
        name: parsed.data.name,
        contact: nullIfEmpty(parsed.data.contact),
        notes: nullIfEmpty(parsed.data.notes),
      });
    });
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", fieldErrors: { name: ["Já existe esse fornecedor."] } };
    }
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite cadastrar." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/inventory");
  return { status: "success", message: "Fornecedor cadastrado." };
}

const purchaseInput = z.object({
  variantId: z.string().trim(),
  supplierId: z.string().trim().optional(),
  paymentMethod: z.enum(["cash", "payable"]),
  quantity: z.coerce.number().int("Use quantidades inteiras.").min(1, "Quantidade mínima de 1."),
  unitCost: z.string().trim(),
});

export async function recordPurchaseAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = purchaseInput.safeParse({
    variantId: formData.get("variantId") ?? "",
    supplierId: formData.get("supplierId") ?? "",
    paymentMethod: formData.get("paymentMethod") ?? "cash",
    quantity: formData.get("quantity") ?? "1",
    unitCost: formData.get("unitCost") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  if (!isUuid(parsed.data.variantId)) {
    return { status: "error", fieldErrors: { variantId: ["Selecione o item."] } };
  }
  const unitCostCents = parsePriceToCents(parsed.data.unitCost);
  if (unitCostCents === null) {
    return { status: "error", fieldErrors: { unitCost: ["Custo inválido."] } };
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      const [variant] = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, parsed.data.variantId),
            eq(productVariants.tenantId, ctx.tenant.id),
          ),
        )
        .limit(1);
      if (!variant) throw new Error("Item inválido.");

      await recordPurchase(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        supplierId: isUuid(parsed.data.supplierId ?? "")
          ? parsed.data.supplierId
          : null,
        paymentMethod: parsed.data.paymentMethod,
        items: [
          {
            variantId: parsed.data.variantId,
            quantity: parsed.data.quantity,
            unitCostCents,
          },
        ],
      });
    });
  } catch (cause) {
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite movimentar estoque." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/inventory");
  return { status: "success", message: "Entrada de estoque registrada." };
}

const adjustmentInput = z.object({
  variantId: z.string().trim(),
  quantityDelta: z.coerce
    .number()
    .int("Use quantidades inteiras.")
    .refine((value) => value !== 0, "Informe uma quantidade diferente de zero."),
  kind: z.enum(["adjustment", "loss"]),
  notes: z.string().trim().max(500, "No máximo 500 caracteres.").optional(),
});

export async function recordAdjustmentAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = adjustmentInput.safeParse({
    variantId: formData.get("variantId") ?? "",
    quantityDelta: formData.get("quantityDelta") ?? "0",
    kind: formData.get("kind") ?? "adjustment",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  if (!isUuid(parsed.data.variantId)) {
    return { status: "error", fieldErrors: { variantId: ["Selecione o item."] } };
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      const [variant] = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, parsed.data.variantId),
            eq(productVariants.tenantId, ctx.tenant.id),
          ),
        )
        .limit(1);
      if (!variant) throw new Error("Item inválido.");

      await recordAdjustment(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        variantId: parsed.data.variantId,
        quantityDelta: parsed.data.quantityDelta,
        kind: parsed.data.kind,
        notes: nullIfEmpty(parsed.data.notes),
      });
    });
  } catch (cause) {
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite movimentar estoque." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/inventory");
  return { status: "success", message: "Ajuste registrado." };
}
