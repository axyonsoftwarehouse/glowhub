import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  chargeItems,
  charges,
  couponRedemptions,
  coupons,
  earnings,
  journalEntries,
  journalLines,
  payments,
  productVariants,
  stockMovements,
} from "@/db/schema";
import type { AppTx } from "@/lib/db";
import { postEntry, reverseLines } from "@/lib/ledger";

export type VoidEligibility =
  | { ok: true }
  | { ok: false; reason: string };

export type VoidCheckInput = {
  status: string;
  voidedAt: Date | null;
  payments: { status: string }[];
  earnings: { status: string }[];
};

/**
 * Regras puras do estorno de cobrança. Uma cobrança só pode ser estornada
 * enquanto está aberta, sem pagamento pendente/confirmado e sem comissão já
 * repassada ao profissional.
 */
export function checkVoidEligibility(
  input: VoidCheckInput,
): VoidEligibility {
  if (input.voidedAt || input.status === "void") {
    return { ok: false, reason: "Esta cobrança já foi estornada." };
  }
  if (input.status !== "open") {
    return {
      ok: false,
      reason: "Só é possível estornar uma cobrança aberta (não paga).",
    };
  }
  if (input.payments.some((payment) => payment.status === "pending")) {
    return {
      ok: false,
      reason: "Há pagamento pendente no gateway. Cancele-o na conciliação antes.",
    };
  }
  if (input.payments.some((payment) => payment.status === "confirmed")) {
    return {
      ok: false,
      reason: "Há pagamento confirmado. Estorne o recebimento antes da cobrança.",
    };
  }
  if (input.earnings.some((earning) => earning.status === "paid")) {
    return {
      ok: false,
      reason: "A comissão já foi repassada ao profissional; não é possível estornar.",
    };
  }
  return { ok: true };
}

export type VoidChargeResult =
  | { ok: true }
  | { ok: false; error: string };

async function reverseEntry(
  tx: AppTx,
  params: {
    tenantId: string;
    userId: string;
    entryId: string;
    description: string;
  },
): Promise<void> {
  const [already] = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.tenantId, params.tenantId),
        eq(journalEntries.reversesEntryId, params.entryId),
      ),
    )
    .limit(1);
  if (already) return;

  const lines = await tx
    .select({
      accountId: journalLines.accountId,
      direction: journalLines.direction,
      amountCents: journalLines.amountCents,
    })
    .from(journalLines)
    .where(
      and(
        eq(journalLines.tenantId, params.tenantId),
        eq(journalLines.entryId, params.entryId),
      ),
    );
  if (lines.length === 0) return;

  await postEntry(tx, {
    tenantId: params.tenantId,
    userId: params.userId,
    description: params.description,
    idempotencyKey: `void-${params.entryId}`,
    referenceType: "charge_void",
    referenceId: params.entryId,
    reversesEntryId: params.entryId,
    lines: reverseLines(lines),
  });
}

/**
 * Estorna uma cobrança aberta de forma auditável:
 * - lança o reverso dos lançamentos da cobrança e dos itens (receita, cupom, CMV);
 * - devolve o estoque consumido (produtos e ficha técnica), sem relançar o CMV
 *   (o reverso contábil já o desfez);
 * - invalida a comissão pendente e libera o uso do cupom;
 * - marca `charges.status = 'void'` com autor, data e motivo.
 */
export async function voidCharge(
  tx: AppTx,
  params: {
    tenantId: string;
    userId: string;
    chargeId: string;
    reason?: string | null;
  },
): Promise<VoidChargeResult> {
  const [charge] = await tx
    .select({
      id: charges.id,
      status: charges.status,
      voidedAt: charges.voidedAt,
    })
    .from(charges)
    .where(
      and(
        eq(charges.id, params.chargeId),
        eq(charges.tenantId, params.tenantId),
      ),
    )
    .limit(1);
  if (!charge) return { ok: false, error: "Cobrança não encontrada." };

  const paymentRows = await tx
    .select({ status: payments.status })
    .from(payments)
    .where(
      and(
        eq(payments.chargeId, charge.id),
        eq(payments.tenantId, params.tenantId),
      ),
    );

  const earningRows = await tx
    .select({
      id: earnings.id,
      status: earnings.status,
      entryId: earnings.entryId,
    })
    .from(earnings)
    .where(
      and(
        eq(earnings.tenantId, params.tenantId),
        eq(earnings.referenceType, "charge"),
        eq(earnings.referenceId, charge.id),
      ),
    );

  const check = checkVoidEligibility({
    status: charge.status,
    voidedAt: charge.voidedAt,
    payments: paymentRows,
    earnings: earningRows,
  });
  if (!check.ok) return { ok: false, error: check.reason };

  const items = await tx
    .select({
      id: chargeItems.id,
      kind: chargeItems.kind,
      referenceId: chargeItems.referenceId,
    })
    .from(chargeItems)
    .where(
      and(
        eq(chargeItems.tenantId, params.tenantId),
        eq(chargeItems.chargeId, charge.id),
      ),
    );
  const itemIds = items.map((item) => item.id);

  // 1. Reverso dos lançamentos da cobrança e dos itens. Inclui receita de
  // serviços, receita de produtos, desconto de cupom e CMV.
  const entryFilters = [
    and(
      eq(journalEntries.referenceType, "charge"),
      eq(journalEntries.referenceId, charge.id),
    ),
  ];
  if (itemIds.length > 0) {
    entryFilters.push(
      and(
        eq(journalEntries.referenceType, "charge_item"),
        inArray(journalEntries.referenceId, itemIds),
      ),
    );
  }

  const entries = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.tenantId, params.tenantId),
        isNull(journalEntries.reversesEntryId),
        or(...entryFilters),
      ),
    );

  for (const entry of entries) {
    await reverseEntry(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      entryId: entry.id,
      description: "Estorno de cobrança",
    });
  }

  // 2. Comissão pendente: reverte o lançamento e marca o earning como void.
  for (const earning of earningRows) {
    if (earning.status !== "pending") continue;
    if (earning.entryId) {
      await reverseEntry(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        entryId: earning.entryId,
        description: "Estorno de comissão",
      });
    }
    await tx
      .update(earnings)
      .set({ status: "void" })
      .where(
        and(
          eq(earnings.id, earning.id),
          eq(earnings.tenantId, params.tenantId),
        ),
      );
  }

  // 3. Devolve o estoque consumido, sem novo lançamento de CMV (já revertido).
  if (itemIds.length > 0) {
    const itemById = new Map(items.map((item) => [item.id, item]));
    const movements = await tx
      .select({
        variantId: stockMovements.variantId,
        referenceId: stockMovements.referenceId,
        kind: stockMovements.kind,
        quantityDelta: stockMovements.quantityDelta,
        unitCostCents: stockMovements.unitCostCents,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, params.tenantId),
          eq(stockMovements.referenceType, "charge_item"),
          inArray(stockMovements.referenceId, itemIds),
          inArray(stockMovements.kind, ["sale", "service_consumption"]),
        ),
      );

    for (const movement of movements) {
      const referenceId = movement.referenceId;
      if (!referenceId || movement.quantityDelta >= 0) continue;
      const item = itemById.get(referenceId);
      const delta = -movement.quantityDelta;

      const inserted = await tx
        .insert(stockMovements)
        .values({
          tenantId: params.tenantId,
          variantId: movement.variantId,
          kind: item?.kind === "product" ? "sale_return" : "service_return",
          quantityDelta: delta,
          unitCostCents: movement.unitCostCents,
          referenceType: "charge_item_void",
          referenceId,
          notes: "Estorno de cobrança",
          createdBy: params.userId,
        })
        .onConflictDoNothing()
        .returning({ id: stockMovements.id });

      if (inserted.length === 0) continue;

      await tx
        .update(productVariants)
        .set({
          stockQuantity: sql`${productVariants.stockQuantity} + ${delta}`,
        })
        .where(
          and(
            eq(productVariants.id, movement.variantId),
            eq(productVariants.tenantId, params.tenantId),
          ),
        );
    }
  }

  // 4. Cupons: o lançamento já foi revertido acima; libera o uso e registra a
  // anulação para auditoria.
  const redemptions = await tx
    .select({ id: couponRedemptions.id, couponId: couponRedemptions.couponId })
    .from(couponRedemptions)
    .where(
      and(
        eq(couponRedemptions.tenantId, params.tenantId),
        eq(couponRedemptions.chargeId, charge.id),
        isNull(couponRedemptions.voidedAt),
      ),
    );
  for (const redemption of redemptions) {
    await tx
      .update(couponRedemptions)
      .set({ voidedAt: new Date() })
      .where(eq(couponRedemptions.id, redemption.id));
    await tx
      .update(coupons)
      .set({ usedCount: sql`greatest(0, ${coupons.usedCount} - 1)` })
      .where(
        and(
          eq(coupons.id, redemption.couponId),
          eq(coupons.tenantId, params.tenantId),
        ),
      );
  }

  await tx
    .update(charges)
    .set({
      status: "void",
      voidedAt: new Date(),
      voidedBy: params.userId,
      voidReason: params.reason?.trim().slice(0, 240) || "Estorno manual",
    })
    .where(
      and(eq(charges.id, charge.id), eq(charges.tenantId, params.tenantId)),
    );

  return { ok: true };
}
