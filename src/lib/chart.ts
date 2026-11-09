import { and, eq } from "drizzle-orm";
import { ledgerAccounts } from "@/db/schema";
import type { AppTx } from "@/lib/db";

export type ChartAccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export type ChartAccount = {
  code: string;
  name: string;
  type: ChartAccountType;
  systemKey?: string;
};

/** Plano de contas padrão aplicado a todo tenant novo. */
export const DEFAULT_CHART: ChartAccount[] = [
  { code: "1", name: "Caixa", type: "asset", systemKey: "cash" },
  { code: "1.1", name: "Banco", type: "asset", systemKey: "bank" },
  {
    code: "1.2",
    name: "Contas a Receber",
    type: "asset",
    systemKey: "accounts_receivable",
  },
  {
    code: "1.3",
    name: "Estoque",
    type: "asset",
    systemKey: "asset_inventory",
  },
  {
    code: "2.1",
    name: "Contas a Pagar",
    type: "liability",
    systemKey: "liability_payable",
  },
  {
    code: "2.2",
    name: "Comissões a Pagar",
    type: "liability",
    systemKey: "liability_commission",
  },
  {
    code: "2.3",
    name: "Gorjetas a Pagar",
    type: "liability",
    systemKey: "liability_tip",
  },
  {
    code: "2.4",
    name: "Carteira de Clientes",
    type: "liability",
    systemKey: "liability_wallet",
  },
  {
    code: "2.5",
    name: "Pacotes a Resgatar",
    type: "liability",
    systemKey: "liability_package",
  },
  {
    code: "2.6",
    name: "Receitas a Apropriar",
    type: "liability",
    systemKey: "liability_deferred_revenue",
  },
  {
    code: "2.7",
    name: "Gift Cards a Resgatar",
    type: "liability",
    systemKey: "liability_gift_card",
  },
  { code: "3.1", name: "Capital / Resultados", type: "equity" },
  {
    code: "4.1",
    name: "Receita de Serviços",
    type: "revenue",
    systemKey: "revenue_service",
  },
  {
    code: "4.2",
    name: "Receita de Produtos",
    type: "revenue",
    systemKey: "revenue_product",
  },
  {
    code: "4.3",
    name: "Receita de Pacotes",
    type: "revenue",
    systemKey: "revenue_package",
  },
  {
    code: "4.4",
    name: "Receita de Assinaturas",
    type: "revenue",
    systemKey: "revenue_subscription",
  },
  {
    code: "4.5",
    name: "Receita de Gift Cards",
    type: "revenue",
    systemKey: "revenue_gift_card",
  },
  { code: "5.1", name: "Despesas Operacionais", type: "expense" },
  {
    code: "5.2",
    name: "Comissões",
    type: "expense",
    systemKey: "expense_commission",
  },
  { code: "5.3", name: "Taxas de Cartão", type: "expense" },
  {
    code: "5.4",
    name: "Descontos e Estornos",
    type: "expense",
    systemKey: "expense_discount",
  },
  {
    code: "5.5",
    name: "Custo de Produtos e Serviços",
    type: "expense",
    systemKey: "expense_cogs",
  },
  {
    code: "5.6",
    name: "Perdas e Ajustes de Estoque",
    type: "expense",
    systemKey: "expense_inventory_loss",
  },
  {
    code: "5.7",
    name: "Despesa de Fidelidade",
    type: "expense",
    systemKey: "expense_loyalty",
  },
];

/**
 * Garante o plano de contas padrão do tenant (idempotente). Pode ser chamado no
 * onboarding, antes de existir movimento financeiro.
 */
export async function ensureDefaultChart(
  tx: AppTx,
  tenantId: string,
): Promise<void> {
  await tx
    .insert(ledgerAccounts)
    .values(
      DEFAULT_CHART.map((account) => ({
        tenantId,
        code: account.code,
        name: account.name,
        type: account.type,
        systemKey: account.systemKey ?? null,
      })),
    )
    .onConflictDoNothing();

  for (const account of DEFAULT_CHART) {
    if (!account.systemKey) continue;
    await tx
      .update(ledgerAccounts)
      .set({ systemKey: account.systemKey })
      .where(
        and(
          eq(ledgerAccounts.tenantId, tenantId),
          eq(ledgerAccounts.code, account.code),
        ),
      );
  }
}
