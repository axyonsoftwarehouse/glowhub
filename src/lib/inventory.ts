import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  chargeItems,
  productVariants,
  products,
  serviceMaterials,
  stockMovements,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { getSystemAccountId, postEntry, type LedgerLineInput } from "@/lib/ledger";
import type { AppTx } from "@/lib/db";

export type MovementKind =
  | "purchase"
  | "sale"
  | "sale_return"
  | "service_consumption"
  | "adjustment"
  | "loss"
  | "opening";

/**
 * Custo medio ponderado ao dar entrada de estoque. Se nao houver saldo/custo
 * anterior, adota o custo da entrada. Logica pura (testavel).
 */
export function movingAverageCost(
  currentQuantity: number,
  currentCostCents: number,
  incomingQuantity: number,
  incomingCostCents: number,
): number {
  if (incomingQuantity <= 0) return currentCostCents;
  if (currentQuantity <= 0 || currentCostCents <= 0) return incomingCostCents;
  return Math.round(
    (currentQuantity * currentCostCents +
      incomingQuantity * incomingCostCents) /
      (currentQuantity + incomingQuantity),
  );
}

/** Item no limite ou abaixo do minimo (ou zerado/negativo) precisa reposicao. */
export function isLowStock(stockQuantity: number, minStock: number): boolean {
  if (stockQuantity <= 0) return true;
  return minStock > 0 && stockQuantity <= minStock;
}

async function recordMovement(
  tx: AppTx,
  input: {
    tenantId: string;
    userId: string;
    variantId: string;
    kind: MovementKind;
    quantityDelta: number;
    unitCostCents?: number;
    supplierId?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
    notes?: string | null;
  },
): Promise<boolean> {
  const inserted = await tx
    .insert(stockMovements)
    .values({
      tenantId: input.tenantId,
      variantId: input.variantId,
      kind: input.kind,
      quantityDelta: input.quantityDelta,
      unitCostCents: input.unitCostCents ?? 0,
      supplierId: input.supplierId ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      notes: input.notes ?? null,
      createdBy: input.userId,
    })
    .onConflictDoNothing()
    .returning({ id: stockMovements.id });

  if (inserted.length === 0) return false;

  const [variant] = await tx
    .select({
      stockQuantity: productVariants.stockQuantity,
      costCents: productVariants.costCents,
    })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, input.variantId),
        eq(productVariants.tenantId, input.tenantId),
      ),
    )
    .limit(1);

  const nextCost =
    input.kind === "purchase"
      ? movingAverageCost(
          variant?.stockQuantity ?? 0,
          variant?.costCents ?? 0,
          input.quantityDelta,
          input.unitCostCents ?? 0,
        )
      : null;

  await tx
    .update(productVariants)
    .set({
      stockQuantity: sql`${productVariants.stockQuantity} + ${input.quantityDelta}`,
      ...(nextCost !== null ? { costCents: nextCost } : {}),
    })
    .where(eq(productVariants.id, input.variantId));

  return true;
}

async function postCostEntry(
  tx: AppTx,
  params: {
    tenantId: string;
    userId: string;
    debitKey: string;
    creditKey: string;
    amountCents: number;
    description: string;
    idempotencyKey: string;
    referenceType: string;
    referenceId: string;
  },
): Promise<void> {
  const debit = await getSystemAccountId(tx, params.tenantId, params.debitKey);
  const credit = await getSystemAccountId(tx, params.tenantId, params.creditKey);
  if (!debit || !credit) {
    logger.warn("inventory_ledger_accounts_missing", {
      debit: params.debitKey,
      credit: params.creditKey,
    });
    return;
  }
  const lines: LedgerLineInput[] = [
    { accountId: debit, direction: "debit", amountCents: params.amountCents },
    { accountId: credit, direction: "credit", amountCents: params.amountCents },
  ];
  await postEntry(tx, {
    tenantId: params.tenantId,
    userId: params.userId,
    description: params.description,
    idempotencyKey: params.idempotencyKey,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    lines,
  });
}

/**
 * Baixa o estoque de um item da cobranca: itens de produto descontam a propria
 * variacao; itens de servico descontam os insumos da ficha tecnica
 * (`service_materials`). Lanca o CMV (D Custo / C Estoque) de forma idempotente.
 * Movimentos e CMV usam o id do item como chave (seguro ao adicionar/remover).
 */
export async function consumeChargeItem(
  tx: AppTx,
  params: { tenantId: string; userId: string; chargeItemId: string },
): Promise<void> {
  const { tenantId, userId, chargeItemId } = params;

  const [item] = await tx
    .select({
      kind: chargeItems.kind,
      referenceId: chargeItems.referenceId,
      quantity: chargeItems.quantity,
    })
    .from(chargeItems)
    .where(
      and(
        eq(chargeItems.tenantId, tenantId),
        eq(chargeItems.id, chargeItemId),
      ),
    )
    .limit(1);
  if (!item || !item.referenceId || item.quantity <= 0) return;

  const consumption = new Map<string, number>();
  let movementKind: MovementKind;
  if (item.kind === "product") {
    consumption.set(item.referenceId, item.quantity);
    movementKind = "sale";
  } else if (item.kind === "service") {
    movementKind = "service_consumption";
    const materials = await tx
      .select({
        variantId: serviceMaterials.variantId,
        quantity: serviceMaterials.quantity,
      })
      .from(serviceMaterials)
      .where(
        and(
          eq(serviceMaterials.tenantId, tenantId),
          eq(serviceMaterials.serviceId, item.referenceId),
        ),
      );
    for (const material of materials) {
      consumption.set(
        material.variantId,
        (consumption.get(material.variantId) ?? 0) +
          material.quantity * item.quantity,
      );
    }
  } else {
    return;
  }

  if (consumption.size === 0) return;

  const variants = await tx
    .select({ id: productVariants.id, costCents: productVariants.costCents })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.tenantId, tenantId),
        inArray(productVariants.id, [...consumption.keys()]),
      ),
    );
  const costById = new Map(variants.map((row) => [row.id, row.costCents]));

  let cogsCents = 0;
  for (const [variantId, quantity] of consumption) {
    if (quantity <= 0) continue;
    const cost = costById.get(variantId) ?? 0;
    const applied = await recordMovement(tx, {
      tenantId,
      userId,
      variantId,
      kind: movementKind,
      quantityDelta: -quantity,
      unitCostCents: cost,
      referenceType: "charge_item",
      referenceId: chargeItemId,
    });
    if (applied) cogsCents += quantity * cost;
  }

  if (cogsCents <= 0) return;
  await postCostEntry(tx, {
    tenantId,
    userId,
    debitKey: "expense_cogs",
    creditKey: "asset_inventory",
    amountCents: cogsCents,
    description: "Custo de produtos e serviços (CMV)",
    idempotencyKey: `cogs-item-${chargeItemId}`,
    referenceType: "charge_item",
    referenceId: chargeItemId,
  });
}

/** Baixa todos os itens de uma cobranca (usado ao gerar a cobranca). */
export async function consumeForCharge(
  tx: AppTx,
  params: { tenantId: string; userId: string; chargeId: string },
): Promise<void> {
  const items = await tx
    .select({ id: chargeItems.id })
    .from(chargeItems)
    .where(
      and(
        eq(chargeItems.tenantId, params.tenantId),
        eq(chargeItems.chargeId, params.chargeId),
      ),
    );
  for (const item of items) {
    await consumeChargeItem(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      chargeItemId: item.id,
    });
  }
}

/**
 * Devolve ao estoque um produto removido da comanda e estorna o CMV
 * (D Estoque / C Custo). Idempotente pelo id do item.
 */
export async function restoreChargeProduct(
  tx: AppTx,
  params: {
    tenantId: string;
    userId: string;
    chargeItemId: string;
    variantId: string;
    quantity: number;
  },
): Promise<void> {
  if (params.quantity <= 0) return;
  const [variant] = await tx
    .select({ costCents: productVariants.costCents })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, params.variantId),
        eq(productVariants.tenantId, params.tenantId),
      ),
    )
    .limit(1);
  const cost = variant?.costCents ?? 0;

  const applied = await recordMovement(tx, {
    tenantId: params.tenantId,
    userId: params.userId,
    variantId: params.variantId,
    kind: "sale_return",
    quantityDelta: params.quantity,
    unitCostCents: cost,
    referenceType: "charge_item_return",
    referenceId: params.chargeItemId,
  });
  if (!applied) return;

  const amountCents = params.quantity * cost;
  if (amountCents <= 0) return;
  await postCostEntry(tx, {
    tenantId: params.tenantId,
    userId: params.userId,
    debitKey: "asset_inventory",
    creditKey: "expense_cogs",
    amountCents,
    description: "Estorno de CMV por remoção de item",
    idempotencyKey: `cogs-return-${params.chargeItemId}`,
    referenceType: "charge_item",
    referenceId: params.chargeItemId,
  });
}

/** Entrada de estoque (compra): atualiza saldo e custo medio e lanca no ledger. */
export async function recordPurchase(
  tx: AppTx,
  params: {
    tenantId: string;
    userId: string;
    supplierId?: string | null;
    paymentMethod: "cash" | "payable";
    items: {
      variantId: string;
      quantity: number;
      unitCostCents: number;
    }[];
  },
): Promise<{ purchaseId: string; totalCents: number }> {
  const purchaseId = crypto.randomUUID();
  let totalCents = 0;
  for (const item of params.items) {
    if (item.quantity <= 0) continue;
    const applied = await recordMovement(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      variantId: item.variantId,
      kind: "purchase",
      quantityDelta: item.quantity,
      unitCostCents: item.unitCostCents,
      supplierId: params.supplierId ?? null,
      referenceType: "stock_purchase",
      referenceId: purchaseId,
    });
    if (applied) totalCents += item.quantity * item.unitCostCents;
  }

  if (totalCents > 0) {
    await postCostEntry(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      debitKey: "asset_inventory",
      creditKey: params.paymentMethod === "payable" ? "liability_payable" : "cash",
      amountCents: totalCents,
      description: "Entrada de estoque",
      idempotencyKey: `purchase-${purchaseId}`,
      referenceType: "stock_purchase",
      referenceId: purchaseId,
    });
  }

  return { purchaseId, totalCents };
}

/** Ajuste/perda de estoque (inventario). Lanca a diferenca pelo custo unitario. */
export async function recordAdjustment(
  tx: AppTx,
  params: {
    tenantId: string;
    userId: string;
    variantId: string;
    quantityDelta: number;
    kind?: "adjustment" | "loss";
    notes?: string | null;
  },
): Promise<void> {
  const kind = params.kind ?? "adjustment";
  const [variant] = await tx
    .select({ costCents: productVariants.costCents })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, params.variantId),
        eq(productVariants.tenantId, params.tenantId),
      ),
    )
    .limit(1);
  const unitCost = variant?.costCents ?? 0;

  const applied = await recordMovement(tx, {
    tenantId: params.tenantId,
    userId: params.userId,
    variantId: params.variantId,
    kind,
    quantityDelta: params.quantityDelta,
    unitCostCents: unitCost,
    notes: params.notes ?? null,
  });
  if (!applied) return;

  const amountCents = Math.abs(params.quantityDelta) * unitCost;
  if (amountCents <= 0) return;
  const movementId = crypto.randomUUID();
  const value = params.quantityDelta < 0
    ? { debitKey: "expense_inventory_loss", creditKey: "asset_inventory" }
    : { debitKey: "asset_inventory", creditKey: "expense_inventory_loss" };
  await postCostEntry(tx, {
    tenantId: params.tenantId,
    userId: params.userId,
    debitKey: value.debitKey,
    creditKey: value.creditKey,
    amountCents,
    description: kind === "loss" ? "Perda de estoque" : "Ajuste de estoque",
    idempotencyKey: `stock-adjustment-${movementId}`,
    referenceType: "stock_movement",
    referenceId: movementId,
  });
}

export type LowStockItem = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  unit: string;
  stockQuantity: number;
  minStock: number;
};

/** Itens ativos no limite/abaixo do minimo (ou zerados/negativos). */
export async function listLowStock(
  tx: AppTx,
  tenantId: string,
): Promise<LowStockItem[]> {
  const rows = await tx
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productName: products.name,
      variantName: productVariants.name,
      unit: productVariants.unit,
      stockQuantity: productVariants.stockQuantity,
      minStock: productVariants.minStock,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(productVariants.tenantId, tenantId),
        eq(productVariants.isActive, true),
        eq(products.isActive, true),
      ),
    )
    .orderBy(asc(productVariants.stockQuantity));

  return rows.filter((row) => isLowStock(row.stockQuantity, row.minStock));
}
