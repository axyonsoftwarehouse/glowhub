"use server";

import { internalError } from "@/lib/errors";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { charges, coupons, couponRedemptions } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSystemAccountId, postEntry } from "@/lib/ledger";
import { parsePriceToCents } from "@/lib/money";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { CouponActionState } from "./types";

const couponInput = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Informe ao menos 3 caracteres.")
    .max(40, "No máximo 40 caracteres.")
    .regex(/^[A-Za-z0-9_-]+$/, "Use apenas letras, números, - e _."),
  description: z.string().trim().max(200).optional(),
  type: z.enum(["percent", "fixed"]),
  value: z.string().trim(),
  minAmount: z.string().trim().optional(),
  maxUses: z.string().trim().optional(),
  expiresAt: z.string().trim().optional(),
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

export async function createCouponAction(
  _prev: CouponActionState,
  formData: FormData,
): Promise<CouponActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = couponInput.safeParse({
    code: formData.get("code") ?? "",
    description: formData.get("description") ?? "",
    type: formData.get("type") ?? "percent",
    value: formData.get("value") ?? "",
    minAmount: formData.get("minAmount") ?? "",
    maxUses: formData.get("maxUses") ?? "",
    expiresAt: formData.get("expiresAt") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  let discountValue: number | null;
  if (parsed.data.type === "percent") {
    const percent = Number((parsed.data.value ?? "").replace(",", "."));
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return { status: "error", fieldErrors: { value: ["Percentual entre 0 e 100."] } };
    }
    discountValue = Math.round(percent * 100);
  } else {
    discountValue = parsePriceToCents(parsed.data.value);
    if (discountValue === null || discountValue <= 0) {
      return { status: "error", fieldErrors: { value: ["Valor inválido."] } };
    }
  }

  const minAmountCents = parsed.data.minAmount
    ? parsePriceToCents(parsed.data.minAmount)
    : 0;
  if (minAmountCents === null || minAmountCents < 0) {
    return { status: "error", fieldErrors: { minAmount: ["Valor mínimo inválido."] } };
  }

  let maxUses: number | null = null;
  if (parsed.data.maxUses && parsed.data.maxUses !== "") {
    const value = Number(parsed.data.maxUses);
    if (!Number.isInteger(value) || value <= 0) {
      return { status: "error", fieldErrors: { maxUses: ["Número de usos inválido."] } };
    }
    maxUses = value;
  }

  const expiresAt = parsed.data.expiresAt
    ? new Date(`${parsed.data.expiresAt}T23:59:59Z`)
    : null;

  try {
    await withUser(ctx.userId, async (tx) => {
      await tx.insert(coupons).values({
        tenantId: ctx.tenant.id,
        code: parsed.data.code,
        description:
          parsed.data.description && parsed.data.description.length > 0
            ? parsed.data.description
            : null,
        discountType: parsed.data.type,
        discountValue,
        minAmountCents,
        maxUses,
        expiresAt,
      });
    });
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", fieldErrors: { code: ["Já existe um cupom com esse código."] } };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/coupons");
  return { status: "success", message: "Cupom criado." };
}

export async function setCouponActiveAction(
  _prev: CouponActionState,
  formData: FormData,
): Promise<CouponActionState> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return { status: "error", message: "Cupom inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(coupons)
        .set({ isActive })
        .where(and(eq(coupons.id, id), eq(coupons.tenantId, ctx.tenant.id)))
        .returning({ id: coupons.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para alterar o cupom." };
    }
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/coupons");
  return { status: "success" };
}

export async function applyCouponAction(
  _prev: CouponActionState,
  formData: FormData,
): Promise<CouponActionState> {
  const chargeId = String(formData.get("chargeId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!chargeId || !code) {
    return { status: "error", message: "Informe o cupom." };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const result = await withUser(ctx.userId, async (tx) => {
      const [charge] = await tx
        .select({
          id: charges.id,
          status: charges.status,
          totalCents: charges.totalCents,
          clientId: charges.clientId,
        })
        .from(charges)
        .where(and(eq(charges.id, chargeId), eq(charges.tenantId, ctx.tenant.id)))
        .limit(1);
      if (!charge) return { error: "Cobrança não encontrada." };
      if (charge.status !== "open") return { error: "Cobrança não está aberta." };

      const [coupon] = await tx
        .select({
          id: coupons.id,
          discountType: coupons.discountType,
          discountValue: coupons.discountValue,
          minAmountCents: coupons.minAmountCents,
          maxUses: coupons.maxUses,
          usedCount: coupons.usedCount,
          startsAt: coupons.startsAt,
          expiresAt: coupons.expiresAt,
          isActive: coupons.isActive,
        })
        .from(coupons)
        .where(
          and(
            eq(coupons.tenantId, ctx.tenant.id),
            sql`lower(${coupons.code}) = lower(${code})`,
          ),
        )
        .limit(1);
      if (!coupon) return { error: "Cupom não encontrado." };
      if (!coupon.isActive) return { error: "Cupom inativo." };
      const now = new Date();
      if (coupon.startsAt && coupon.startsAt > now) return { error: "Cupom ainda não vigente." };
      if (coupon.expiresAt && coupon.expiresAt < now) return { error: "Cupom expirado." };
      if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
        return { error: "Cupom esgotado." };
      }
      if (charge.totalCents < coupon.minAmountCents) {
        return { error: "Cobrança abaixo do valor mínimo do cupom." };
      }

      const discount =
        coupon.discountType === "percent"
          ? Math.round((charge.totalCents * coupon.discountValue) / 10000)
          : coupon.discountValue;
      const amount = Math.min(discount, charge.totalCents);
      if (amount <= 0) return { error: "Desconto inválido." };

      const discountAccount = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "expense_discount",
      );
      const receivable = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "accounts_receivable",
      );
      if (!discountAccount || !receivable) {
        return { error: "Crie o plano de contas padrão em Financeiro." };
      }

      await tx
        .update(charges)
        .set({ totalCents: charge.totalCents - amount })
        .where(eq(charges.id, charge.id));

      const entryId = await postEntry(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        description: `Desconto (cupom ${code})`,
        idempotencyKey: `coupon-${charge.id}-${coupon.id}`,
        referenceType: "charge",
        referenceId: charge.id,
        lines: [
          { accountId: discountAccount, direction: "debit", amountCents: amount },
          { accountId: receivable, direction: "credit", amountCents: amount },
        ],
      });

      await tx.insert(couponRedemptions).values({
        tenantId: ctx.tenant.id,
        couponId: coupon.id,
        chargeId: charge.id,
        clientId: charge.clientId,
        amountCents: amount,
        entryId,
        createdBy: ctx.userId,
      });

      await tx
        .update(coupons)
        .set({ usedCount: coupon.usedCount + 1 })
        .where(eq(coupons.id, coupon.id));

      return { ok: true as const };
    });

    if ("error" in result) return { status: "error", message: result.error };
    revalidatePath("/coupons");
    revalidatePath("/finance");
    return { status: "success", message: "Cupom aplicado." };
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }
}
