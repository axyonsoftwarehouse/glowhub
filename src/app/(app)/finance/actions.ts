"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  appointments,
  chargeItems,
  charges,
  journalEntries,
  journalLines,
  ledgerAccounts,
  services,
} from "@/db/schema";
import { withUser, type AppTx } from "@/lib/db";
import { getSystemAccountId, postEntry } from "@/lib/ledger";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { AccountType, FinanceActionState } from "./types";

const accountInput = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Informe o código.")
    .max(30, "No máximo 30 caracteres."),
  name: z
    .string()
    .trim()
    .min(2, "Informe ao menos 2 caracteres.")
    .max(120, "No máximo 120 caracteres."),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
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

const DEFAULT_CHART: {
  code: string;
  name: string;
  type: AccountType;
  systemKey?: string;
}[] = [
  { code: "1", name: "Caixa", type: "asset", systemKey: "cash" },
  { code: "1.1", name: "Banco", type: "asset", systemKey: "bank" },
  { code: "1.2", name: "Contas a Receber", type: "asset", systemKey: "accounts_receivable" },
  { code: "1.3", name: "Estoque", type: "asset" },
  { code: "2.1", name: "Contas a Pagar", type: "liability" },
  { code: "2.2", name: "Comissões a Pagar", type: "liability" },
  { code: "2.3", name: "Gorjetas a Pagar", type: "liability" },
  { code: "3.1", name: "Capital / Resultados", type: "equity" },
  { code: "4.1", name: "Receita de Serviços", type: "revenue", systemKey: "revenue_service" },
  { code: "4.2", name: "Receita de Produtos", type: "revenue", systemKey: "revenue_product" },
  { code: "4.3", name: "Receita de Pacotes/Assinaturas", type: "revenue", systemKey: "revenue_package" },
  { code: "5.1", name: "Despesas Operacionais", type: "expense" },
  { code: "5.2", name: "Comissões", type: "expense" },
  { code: "5.3", name: "Taxas de Cartão", type: "expense" },
  { code: "5.4", name: "Descontos e Estornos", type: "expense" },
];

export async function createAccountAction(
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = accountInput.safeParse({
    code: formData.get("code") ?? "",
    name: formData.get("name") ?? "",
    type: formData.get("type") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      await tx.insert(ledgerAccounts).values({
        tenantId: ctx.tenant.id,
        code: parsed.data.code,
        name: parsed.data.name,
        type: parsed.data.type,
      });
    });
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", fieldErrors: { code: ["Já existe uma conta com esse código."] } };
    }
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite criar contas." };
    }
    return { status: "error", message: String(cause) };
  }

  revalidatePath("/finance");
  return { status: "success", message: "Conta criada." };
}

export async function setAccountActiveAction(
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return { status: "error", message: "Conta inválida." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(ledgerAccounts)
        .set({ isActive })
        .where(
          and(eq(ledgerAccounts.id, id), eq(ledgerAccounts.tenantId, ctx.tenant.id)),
        )
        .returning({ id: ledgerAccounts.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para alterar a conta." };
    }
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }

  revalidatePath("/finance");
  return { status: "success" };
}

export async function createDefaultChartAction(): Promise<FinanceActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    await withUser(ctx.userId, async (tx) => {
      await tx
        .insert(ledgerAccounts)
        .values(
          DEFAULT_CHART.map((account) => ({
            tenantId: ctx.tenant.id,
            code: account.code,
            name: account.name,
            type: account.type,
            systemKey: account.systemKey ?? null,
          })),
        )
        .onConflictDoNothing();
    });
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }

  revalidatePath("/finance");
  return { status: "success", message: "Plano de contas padrão criado." };
}

const journalPayload = z.object({
  description: z
    .string()
    .trim()
    .min(2, "Descreva o lançamento.")
    .max(200, "No máximo 200 caracteres."),
  occurredAt: z.string().optional(),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid("Conta inválida."),
        direction: z.enum(["debit", "credit"]),
        amountCents: z
          .number()
          .int("Valor inválido.")
          .positive("O valor deve ser maior que zero."),
      }),
    )
    .min(2, "Um lançamento precisa de ao menos duas partidas."),
});

export async function postJournalEntryAction(payload: {
  description: string;
  occurredAt?: string;
  lines: { accountId: string; direction: "debit" | "credit"; amountCents: number }[];
}): Promise<FinanceActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = journalPayload.safeParse(payload);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const debits = parsed.data.lines
    .filter((line) => line.direction === "debit")
    .reduce((sum, line) => sum + line.amountCents, 0);
  const credits = parsed.data.lines
    .filter((line) => line.direction === "credit")
    .reduce((sum, line) => sum + line.amountCents, 0);

  if (debits !== credits) {
    return {
      status: "error",
      message: "O lançamento não fecha: débitos e créditos devem ser iguais.",
    };
  }

  const accountIds = [...new Set(parsed.data.lines.map((line) => line.accountId))];
  const occurredAt = parsed.data.occurredAt
    ? new Date(parsed.data.occurredAt)
    : new Date();

  try {
    await withUser(ctx.userId, async (tx: AppTx) => {
      const validAccounts = await tx
        .select({ id: ledgerAccounts.id })
        .from(ledgerAccounts)
        .where(
          and(
            eq(ledgerAccounts.tenantId, ctx.tenant.id),
            inArray(ledgerAccounts.id, accountIds),
          ),
        );
      if (validAccounts.length !== accountIds.length) {
        throw new Error("Conta contábil não encontrada.");
      }

      const [entry] = await tx
        .insert(journalEntries)
        .values({
          tenantId: ctx.tenant.id,
          occurredAt,
          description: parsed.data.description,
          idempotencyKey: randomUUID(),
          createdBy: ctx.userId,
        })
        .returning({ id: journalEntries.id });

      await tx.insert(journalLines).values(
        parsed.data.lines.map((line) => ({
          tenantId: ctx.tenant.id,
          entryId: entry.id,
          accountId: line.accountId,
          direction: line.direction,
          amountCents: line.amountCents,
        })),
      );
    });
  } catch (cause) {
    const message = String(cause);
    if (message.includes("not balanced")) {
      return { status: "error", message: "O lançamento não fecha (débitos ≠ créditos)." };
    }
    if (message.includes("append-only")) {
      return { status: "error", message: "Ledger é append-only." };
    }
    return { status: "error", message };
  }

  revalidatePath("/finance");
  return { status: "success", message: "Lançamento registrado." };
}

export async function createChargeAction(
  appointmentId: string,
): Promise<FinanceActionState> {
  if (!appointmentId) return { status: "error", message: "Agendamento inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const result = await withUser(ctx.userId, async (tx) => {
      const [appointment] = await tx
        .select({
          id: appointments.id,
          clientId: appointments.clientId,
          serviceId: appointments.serviceId,
          priceCents: appointments.priceCents,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.id, appointmentId),
            eq(appointments.tenantId, ctx.tenant.id),
          ),
        )
        .limit(1);
      if (!appointment) return { error: "Agendamento não encontrado." };

      const [existing] = await tx
        .select({ id: charges.id })
        .from(charges)
        .where(
          and(
            eq(charges.appointmentId, appointmentId),
            eq(charges.tenantId, ctx.tenant.id),
          ),
        )
        .limit(1);
      if (existing) return { ok: true as const, already: true };

      if (appointment.priceCents <= 0) {
        return { error: "Este agendamento não tem valor a cobrar." };
      }

      const [service] = await tx
        .select({ name: services.name })
        .from(services)
        .where(eq(services.id, appointment.serviceId))
        .limit(1);

      const receivable = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "accounts_receivable",
      );
      const revenue = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "revenue_service",
      );
      if (!receivable || !revenue) {
        return { error: "Crie o plano de contas padrão em Financeiro." };
      }

      const [charge] = await tx
        .insert(charges)
        .values({
          tenantId: ctx.tenant.id,
          appointmentId,
          clientId: appointment.clientId,
          status: "open",
          totalCents: appointment.priceCents,
          createdBy: ctx.userId,
        })
        .returning({ id: charges.id });

      await tx.insert(chargeItems).values({
        tenantId: ctx.tenant.id,
        chargeId: charge.id,
        kind: "service",
        referenceId: appointment.serviceId,
        description: service?.name ?? "Serviço",
        quantity: 1,
        unitPriceCents: appointment.priceCents,
        totalCents: appointment.priceCents,
      });

      const entryId = await postEntry(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        description: `Cobrança: ${service?.name ?? "Serviço"}`,
        idempotencyKey: `charge-revenue-${charge.id}`,
        referenceType: "charge",
        referenceId: charge.id,
        lines: [
          {
            accountId: receivable,
            direction: "debit",
            amountCents: appointment.priceCents,
          },
          {
            accountId: revenue,
            direction: "credit",
            amountCents: appointment.priceCents,
          },
        ],
      });

      await tx
        .update(charges)
        .set({ revenueEntryId: entryId })
        .where(eq(charges.id, charge.id));

      return { ok: true as const, already: false };
    });

    if ("error" in result) return { status: "error", message: result.error };
    revalidatePath("/finance");
    revalidatePath("/appointments");
    return {
      status: "success",
      message: result.already ? "Este atendimento já foi cobrado." : "Cobrança gerada.",
    };
  } catch (cause) {
    const message = String(cause);
    if (message.includes("charges_appointment_key")) {
      return { status: "success", message: "Este atendimento já foi cobrado." };
    }
    if (message.includes("not balanced")) {
      return { status: "error", message: "Lançamento desbalanceado." };
    }
    return { status: "error", message };
  }
}

export async function settleChargeAction(
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Cobrança inválida." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const result = await withUser(ctx.userId, async (tx) => {
      const [charge] = await tx
        .select({
          id: charges.id,
          status: charges.status,
          totalCents: charges.totalCents,
        })
        .from(charges)
        .where(and(eq(charges.id, id), eq(charges.tenantId, ctx.tenant.id)))
        .limit(1);
      if (!charge) return { error: "Cobrança não encontrada." };
      if (charge.status !== "open") {
        return { ok: true as const, already: true };
      }

      const receivable = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "accounts_receivable",
      );
      const cash = await getSystemAccountId(tx, ctx.tenant.id, "cash");
      if (!receivable || !cash) {
        return { error: "Crie o plano de contas padrão em Financeiro." };
      }

      const entryId = await postEntry(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        description: "Recebimento em dinheiro",
        idempotencyKey: `charge-settle-${charge.id}`,
        referenceType: "charge",
        referenceId: charge.id,
        lines: [
          { accountId: cash, direction: "debit", amountCents: charge.totalCents },
          {
            accountId: receivable,
            direction: "credit",
            amountCents: charge.totalCents,
          },
        ],
      });

      await tx
        .update(charges)
        .set({ status: "paid", settlementEntryId: entryId })
        .where(eq(charges.id, charge.id));

      return { ok: true as const, already: false };
    });

    if ("error" in result) return { status: "error", message: result.error };
    revalidatePath("/finance");
    return {
      status: "success",
      message: result.already ? "Cobrança já estava paga." : "Cobrança recebida.",
    };
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }
}
