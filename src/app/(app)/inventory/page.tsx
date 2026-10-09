import { and, asc, desc, eq } from "drizzle-orm";
import {
  memberships,
  productVariants,
  products,
  stockMovements,
  suppliers,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { listLowStock } from "@/lib/inventory";
import { formatCentsBRL } from "@/lib/money";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { InventoryForms, SupplierForm } from "./inventory-forms";
import type {
  InventoryMovementRow,
  InventoryVariantOption,
  SupplierRow,
} from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager", "staff"];

const KIND_LABELS: Record<string, string> = {
  purchase: "Entrada",
  sale: "Venda",
  sale_return: "Devolução",
  service_consumption: "Insumo (serviço)",
  adjustment: "Ajuste",
  loss: "Perda",
  opening: "Saldo inicial",
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function InventoryPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar o estoque.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const { variantOptions, lowStock, movements, supplierRows, canManage } =
    await withUser(userId, async (tx) => {
      const variantRows = await tx
        .select({
          variantId: productVariants.id,
          productName: products.name,
          variantName: productVariants.name,
          unit: productVariants.unit,
          stockQuantity: productVariants.stockQuantity,
          costCents: productVariants.costCents,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(
          and(
            eq(productVariants.tenantId, tenant.id),
            eq(productVariants.isActive, true),
          ),
        )
        .orderBy(asc(products.name), asc(productVariants.name));

      const movementRows = await tx
        .select({
          id: stockMovements.id,
          kind: stockMovements.kind,
          quantityDelta: stockMovements.quantityDelta,
          unitCostCents: stockMovements.unitCostCents,
          notes: stockMovements.notes,
          createdAt: stockMovements.createdAt,
          variantName: productVariants.name,
          productName: products.name,
          unit: productVariants.unit,
          supplierName: suppliers.name,
        })
        .from(stockMovements)
        .innerJoin(
          productVariants,
          eq(productVariants.id, stockMovements.variantId),
        )
        .innerJoin(products, eq(products.id, productVariants.productId))
        .leftJoin(suppliers, eq(suppliers.id, stockMovements.supplierId))
        .where(eq(stockMovements.tenantId, tenant.id))
        .orderBy(desc(stockMovements.createdAt))
        .limit(50);

      const supplierList = await tx
        .select({
          id: suppliers.id,
          name: suppliers.name,
          contact: suppliers.contact,
          isActive: suppliers.isActive,
        })
        .from(suppliers)
        .where(eq(suppliers.tenantId, tenant.id))
        .orderBy(asc(suppliers.name));

      const [membership] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.tenantId, tenant.id),
            eq(memberships.userId, userId),
          ),
        )
        .limit(1);

      return {
        variantOptions: variantRows.map((row) => ({
          variantId: row.variantId,
          label: `${row.productName} · ${row.variantName}`,
          unit: row.unit,
          stockQuantity: row.stockQuantity,
          costCents: row.costCents,
        })) satisfies InventoryVariantOption[],
        lowStock: await listLowStock(tx, tenant.id),
        movements: movementRows.map((row) => ({
          id: row.id,
          kind: row.kind,
          quantityDelta: row.quantityDelta,
          unitCostCents: row.unitCostCents,
          label: `${row.productName} · ${row.variantName}`,
          unit: row.unit,
          supplierName: row.supplierName ?? null,
          notes: row.notes ?? null,
          createdAt: row.createdAt,
        })) satisfies InventoryMovementRow[],
        supplierRows: supplierList as SupplierRow[],
        canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
      };
    });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Estoque</p>
        <h1 className="mt-2 text-2xl font-semibold">Estoque e insumos</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Entradas, baixas automáticas, ajustes e alertas de reposição de{" "}
          {tenant.name}.
        </p>
      </header>

      {lowStock.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            Reposição necessária ({lowStock.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {lowStock.map((item) => (
              <li key={item.variantId}>
                {item.productName} · {item.variantName}: {item.stockQuantity}{" "}
                {item.unit}
                {item.minStock > 0 ? ` (mínimo ${item.minStock})` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canManage && (
        <InventoryForms variants={variantOptions} suppliers={supplierRows} />
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Movimentações recentes
        </h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-foreground/70">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2 text-right">Qtd.</th>
                <th className="px-3 py-2 text-right">Custo un.</th>
                <th className="px-3 py-2">Fornecedor</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap text-foreground/70">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 text-foreground/60">
                    {KIND_LABELS[row.kind] ?? row.kind}
                    {row.notes ? ` · ${row.notes}` : ""}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-medium ${
                      row.quantityDelta >= 0
                        ? "text-emerald-700"
                        : "text-red-600"
                    }`}
                  >
                    {row.quantityDelta > 0 ? "+" : ""}
                    {row.quantityDelta} {row.unit}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCentsBRL(row.unitCostCents)}
                  </td>
                  <td className="px-3 py-2 text-foreground/60">
                    {row.supplierName ?? "—"}
                  </td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-sm text-foreground/60">
                    Nenhuma movimentação registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Fornecedores
        </h2>
        {canManage && <SupplierForm />}
        <div className="mt-4 space-y-1">
          {supplierRows.map((supplier) => (
            <div
              key={supplier.id}
              className="flex items-center justify-between rounded-lg border border-border bg-white/60 px-3 py-2 text-sm"
            >
              <span>{supplier.name}</span>
              <span className="text-xs text-foreground/60">
                {supplier.contact ?? "sem contato"}
              </span>
            </div>
          ))}
          {supplierRows.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum fornecedor cadastrado.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
