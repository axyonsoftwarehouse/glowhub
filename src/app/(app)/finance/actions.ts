"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  appointments,
  chargeItems,
  charges,
  clients,
  earnings,
  journalEntries,
  journalLines,
  ledgerAccounts,
  payments,
  payouts,
  professionals,
  services,
  walletTransactions,
} from "@/db/schema";
import { withUser, type AppTx } from "@/lib/db";
import {
  getSystemAccountId,
  postEntry,
  type LedgerLineInput,
} from "@/lib/ledger";
import { parsePriceToCents } from "@/lib/money";
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
  { code: "2.2", name: "Comissões a Pagar", type: "liability", systemKey: "liability_commission" },
  { code: "2.3", name: "Gorjetas a Pagar", type: "liability", systemKey: "liability_tip" },
  { code: "2.4", name: "Carteira de Clientes", type: "liability", systemKey: "liability_wallet" },
  { code: "2.5", name: "Pacotes a Resgatar", type: "liability", systemKey: "liability_package" },
  { code: "3.1", name: "Capital / Resultados", type: "equity" },
  { code: "4.1", name: "Receita de Serviços", type: "revenue", systemKey: "revenue_service" },
  { code: "4.2", name: "Receita de Produtos", type: "revenue", systemKey: "revenue_product" },
  { code: "4.3", name: "Receita de Pacotes", type: "revenue", systemKey: "revenue_package" },
  { code: "4.4", name: "Receita de Assinaturas", type: "revenue", systemKey: "revenue_subscription" },
  { code: "5.1", name: "Despesas Operacionais", type: "expense" },
  { code: "5.2", name: "Comissões", type: "expense", systemKey: "expense_commission" },
  { code: "5.3", name: "Taxas de Cartão", type: "expense" },
  { code: "5.4", name: "Descontos e Estornos", type: "expense", systemKey: "expense_discount" },
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

      // Garante/atualiza as contas de sistema em tenants ja existentes.
      for (const account of DEFAULT_CHART) {
        if (!account.systemKey) continue;
        await tx
          .update(ledgerAccounts)
          .set({ systemKey: account.systemKey })
          .where(
            and(
              eq(ledgerAccounts.tenantId, ctx.tenant.id),
              eq(ledgerAccounts.code, account.code),
            ),
          );
      }
    });
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }

  revalidatePath("/finance");
  return { status: "success", message: "Plano de contas padrão aplicado." };
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
          professionalId: appointments.professionalId,
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

      // Comissão do profissional (se configurada).
      const [professional] = await tx
        .select({ commissionBp: professionals.commissionBp })
        .from(professionals)
        .where(eq(professionals.id, appointment.professionalId))
        .limit(1);
      const commissionCents = Math.round(
        (appointment.priceCents * (professional?.commissionBp ?? 0)) / 10000,
      );
      if (commissionCents > 0) {
        const expenseCommission = await getSystemAccountId(
          tx,
          ctx.tenant.id,
          "expense_commission",
        );
        const liabilityCommission = await getSystemAccountId(
          tx,
          ctx.tenant.id,
          "liability_commission",
        );
        if (expenseCommission && liabilityCommission) {
          const [earning] = await tx
            .insert(earnings)
            .values({
              tenantId: ctx.tenant.id,
              professionalId: appointment.professionalId,
              kind: "commission",
              amountCents: commissionCents,
              status: "pending",
              referenceType: "charge",
              referenceId: charge.id,
            })
            .returning({ id: earnings.id });
          const commissionEntry = await postEntry(tx, {
            tenantId: ctx.tenant.id,
            userId: ctx.userId,
            description: `Comissão: ${service?.name ?? "Serviço"}`,
            idempotencyKey: `commission-${charge.id}`,
            referenceType: "earning",
            referenceId: earning.id,
            lines: [
              {
                accountId: expenseCommission,
                direction: "debit",
                amountCents: commissionCents,
              },
              {
                accountId: liabilityCommission,
                direction: "credit",
                amountCents: commissionCents,
              },
            ],
          });
          await tx
            .update(earnings)
            .set({ entryId: commissionEntry })
            .where(eq(earnings.id, earning.id));
        }
      }

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

type PaymentMethod =
  | "cash"
  | "debit"
  | "credit"
  | "pix"
  | "transfer"
  | "wallet"
  | "other";

const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "debit",
  "credit",
  "pix",
  "transfer",
  "wallet",
  "other",
];

export async function registerPaymentAction(
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const chargeId = String(formData.get("chargeId") ?? "");
  const method = String(formData.get("method") ?? "cash") as PaymentMethod;
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const tipRaw = String(formData.get("tip") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!chargeId) return { status: "error", message: "Cobrança inválida." };
  if (!PAYMENT_METHODS.includes(method)) {
    return { status: "error", message: "Forma de pagamento inválida." };
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
      if (charge.status === "void") return { error: "Cobrança estornada." };

      const confirmedRows = await tx
        .select({ amountCents: payments.amountCents })
        .from(payments)
        .where(
          and(
            eq(payments.chargeId, charge.id),
            eq(payments.tenantId, ctx.tenant.id),
            eq(payments.status, "confirmed"),
          ),
        );
      const paid = confirmedRows.reduce((sum, row) => sum + row.amountCents, 0);
      const remaining = charge.totalCents - paid;
      if (remaining <= 0) return { ok: true as const, already: true };

      const amountCents = amountRaw === "" ? remaining : parsePriceToCents(amountRaw);
      if (amountCents === null || amountCents <= 0) {
        return { error: "Valor inválido." };
      }
      if (amountCents > remaining) {
        return { error: "Valor maior que o saldo em aberto da cobrança." };
      }

      const tipCents =
        tipRaw === "" ? 0 : (parsePriceToCents(tipRaw) ?? Number.NaN);
      if (Number.isNaN(tipCents) || tipCents < 0) {
        return { error: "Gorjeta inválida." };
      }

      let tipProfessionalId: string | null = null;
      let liabilityTip: string | null = null;
      if (tipCents > 0) {
        const [chargeAppointment] = await tx
          .select({ professionalId: appointments.professionalId })
          .from(charges)
          .innerJoin(appointments, eq(charges.appointmentId, appointments.id))
          .where(eq(charges.id, charge.id))
          .limit(1);
        tipProfessionalId = chargeAppointment?.professionalId ?? null;
        liabilityTip = await getSystemAccountId(
          tx,
          ctx.tenant.id,
          "liability_tip",
        );
        if (!tipProfessionalId || !liabilityTip) {
          return { error: "Não foi possível registrar a gorjeta (conta/profissional)." };
        }
      }

      const totalDebit = amountCents + tipCents;
      const receivable = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "accounts_receivable",
      );
      let debitAccount: string | null;
      if (method === "wallet") {
        debitAccount = await getSystemAccountId(
          tx,
          ctx.tenant.id,
          "liability_wallet",
        );
        if (debitAccount && charge.clientId) {
          const walletRows = await tx
            .select({ amountCents: walletTransactions.amountCents })
            .from(walletTransactions)
            .where(
              and(
                eq(walletTransactions.tenantId, ctx.tenant.id),
                eq(walletTransactions.clientId, charge.clientId),
              ),
            );
          const balance = walletRows.reduce(
            (sum, row) => sum + row.amountCents,
            0,
          );
          if (balance < totalDebit) {
            return { error: "Saldo insuficiente na carteira do cliente." };
          }
        }
      } else {
        debitAccount = await getSystemAccountId(
          tx,
          ctx.tenant.id,
          method === "cash" ? "cash" : "bank",
        );
      }
      if (!receivable || !debitAccount) {
        return { error: "Crie o plano de contas padrão em Financeiro." };
      }

      const [payment] = await tx
        .insert(payments)
        .values({
          tenantId: ctx.tenant.id,
          chargeId: charge.id,
          method,
          amountCents,
          status: "confirmed",
          idempotencyKey: randomUUID(),
          notes: notes.length > 0 ? notes : null,
          createdBy: ctx.userId,
        })
        .returning({ id: payments.id });

      const entryId = await postEntry(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        description: `Recebimento (${method})`,
        idempotencyKey: `payment-${payment.id}`,
        referenceType: "payment",
        referenceId: payment.id,
        lines: [
          {
            accountId: debitAccount,
            direction: "debit",
            amountCents: amountCents + tipCents,
          },
          { accountId: receivable, direction: "credit", amountCents },
          ...(tipCents > 0 && liabilityTip
            ? [
                {
                  accountId: liabilityTip,
                  direction: "credit" as const,
                  amountCents: tipCents,
                },
              ]
            : []),
        ],
      });

      await tx
        .update(payments)
        .set({ entryId })
        .where(eq(payments.id, payment.id));

      if (method === "wallet" && charge.clientId) {
        await tx.insert(walletTransactions).values({
          tenantId: ctx.tenant.id,
          clientId: charge.clientId,
          amountCents: -totalDebit,
          kind: "payment",
          referenceType: "payment",
          referenceId: payment.id,
          entryId,
          createdBy: ctx.userId,
        });
      }

      if (tipCents > 0 && tipProfessionalId) {
        const [tipEarning] = await tx
          .insert(earnings)
          .values({
            tenantId: ctx.tenant.id,
            professionalId: tipProfessionalId,
            kind: "tip",
            amountCents: tipCents,
            status: "pending",
            referenceType: "payment",
            referenceId: payment.id,
          })
          .returning({ id: earnings.id });
        await tx
          .update(earnings)
          .set({ entryId })
          .where(eq(earnings.id, tipEarning.id));
      }

      const paidAfter = paid + amountCents;
      if (paidAfter >= charge.totalCents) {
        await tx
          .update(charges)
          .set({ status: "paid", settlementEntryId: entryId })
          .where(eq(charges.id, charge.id));
      }

      return { ok: true as const, already: false };
    });

    if ("error" in result) return { status: "error", message: result.error };
    revalidatePath("/finance");
    revalidatePath("/appointments");
    return {
      status: "success",
      message: result.already ? "Cobrança já está quitada." : "Pagamento registrado.",
    };
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }
}

export async function payProfessionalAction(
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const professionalId = String(formData.get("professionalId") ?? "");
  const method = String(formData.get("method") ?? "cash") as PaymentMethod;
  if (!professionalId) return { status: "error", message: "Profissional inválido." };
  if (!PAYMENT_METHODS.includes(method)) {
    return { status: "error", message: "Forma de pagamento inválida." };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const result = await withUser(ctx.userId, async (tx) => {
      const pending = await tx
        .select({
          kind: earnings.kind,
          amountCents: earnings.amountCents,
        })
        .from(earnings)
        .where(
          and(
            eq(earnings.tenantId, ctx.tenant.id),
            eq(earnings.professionalId, professionalId),
            eq(earnings.status, "pending"),
          ),
        );
      if (pending.length === 0) return { ok: true as const, already: true };

      const commissionTotal = pending
        .filter((row) => row.kind === "commission")
        .reduce((sum, row) => sum + row.amountCents, 0);
      const tipTotal = pending
        .filter((row) => row.kind === "tip")
        .reduce((sum, row) => sum + row.amountCents, 0);
      const total = commissionTotal + tipTotal;

      const liabilityCommission = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "liability_commission",
      );
      const liabilityTip = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "liability_tip",
      );
      const creditAccount = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        method === "cash" ? "cash" : "bank",
      );
      if (!creditAccount) {
        return { error: "Crie o plano de contas padrão em Financeiro." };
      }
      if (commissionTotal > 0 && !liabilityCommission) {
        return { error: "Conta 'Comissões a Pagar' ausente no plano de contas." };
      }
      if (tipTotal > 0 && !liabilityTip) {
        return { error: "Conta 'Gorjetas a Pagar' ausente no plano de contas." };
      }

      const lines: LedgerLineInput[] = [];
      if (commissionTotal > 0 && liabilityCommission) {
        lines.push({
          accountId: liabilityCommission,
          direction: "debit",
          amountCents: commissionTotal,
        });
      }
      if (tipTotal > 0 && liabilityTip) {
        lines.push({
          accountId: liabilityTip,
          direction: "debit",
          amountCents: tipTotal,
        });
      }
      lines.push({
        accountId: creditAccount,
        direction: "credit",
        amountCents: total,
      });

      const [payout] = await tx
        .insert(payouts)
        .values({
          tenantId: ctx.tenant.id,
          professionalId,
          totalCents: total,
          method,
          idempotencyKey: randomUUID(),
          createdBy: ctx.userId,
        })
        .returning({ id: payouts.id });

      const entryId = await postEntry(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        description: "Repasse ao profissional",
        idempotencyKey: `payout-${payout.id}`,
        referenceType: "payout",
        referenceId: payout.id,
        lines,
      });

      await tx
        .update(payouts)
        .set({ entryId })
        .where(eq(payouts.id, payout.id));

      await tx
        .update(earnings)
        .set({ status: "paid", payoutId: payout.id })
        .where(
          and(
            eq(earnings.tenantId, ctx.tenant.id),
            eq(earnings.professionalId, professionalId),
            eq(earnings.status, "pending"),
          ),
        );

      return { ok: true as const, already: false };
    });

    if ("error" in result) return { status: "error", message: result.error };
    revalidatePath("/finance");
    return {
      status: "success",
      message: result.already ? "Nada a repassar." : "Repasse registrado.",
    };
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }
}

export async function addWalletCreditAction(
  _prev: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const clientId = String(formData.get("clientId") ?? "");
  const method = String(formData.get("method") ?? "cash") as PaymentMethod;
  const amountRaw = String(formData.get("amount") ?? "").trim();

  if (!clientId) return { status: "error", message: "Cliente inválido." };
  if (!PAYMENT_METHODS.includes(method)) {
    return { status: "error", message: "Forma de pagamento inválida." };
  }
  const amountCents = parsePriceToCents(amountRaw);
  if (amountCents === null || amountCents <= 0) {
    return { status: "error", message: "Valor inválido." };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const result = await withUser(ctx.userId, async (tx) => {
      const [client] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenant.id)))
        .limit(1);
      if (!client) return { error: "Cliente não encontrado." };

      const wallet = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "liability_wallet",
      );
      const debitAccount = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        method === "cash" ? "cash" : "bank",
      );
      if (!wallet || !debitAccount) {
        return { error: "Crie o plano de contas padrão em Financeiro." };
      }

      const [walletTx] = await tx
        .insert(walletTransactions)
        .values({
          tenantId: ctx.tenant.id,
          clientId,
          amountCents,
          kind: "topup",
          createdBy: ctx.userId,
        })
        .returning({ id: walletTransactions.id });

      const entryId = await postEntry(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        description: "Crédito em carteira",
        idempotencyKey: `wallet-topup-${walletTx.id}`,
        referenceType: "wallet",
        referenceId: walletTx.id,
        lines: [
          { accountId: debitAccount, direction: "debit", amountCents },
          { accountId: wallet, direction: "credit", amountCents },
        ],
      });

      await tx
        .update(walletTransactions)
        .set({ entryId })
        .where(eq(walletTransactions.id, walletTx.id));

      return { ok: true as const };
    });

    if ("error" in result) return { status: "error", message: result.error };
    revalidatePath("/clients");
    revalidatePath("/finance");
    return { status: "success", message: "Crédito adicionado à carteira." };
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }
}
