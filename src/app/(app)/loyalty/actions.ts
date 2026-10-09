"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  appointments,
  campaigns,
  charges,
  clients,
  giftCardRedemptions,
  giftCards,
  loyaltyPoints,
  loyaltySettings,
  payments,
  walletTransactions,
} from "@/db/schema";
import { withUser, type AppTx } from "@/lib/db";
import { internalError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";
import { classifyClient, isVip, vipThresholdCents } from "@/lib/crm";
import { creditCentsForPoints, getLoyaltySettings } from "@/lib/loyalty";
import { getSystemAccountId, postEntry } from "@/lib/ledger";
import { parsePriceToCents } from "@/lib/money";
import { enqueueEmail } from "@/lib/notifications";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { LoyaltyActionState } from "./types";

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

function friendly(cause: unknown): string {
  const code = errorCode(cause);
  const message = cause instanceof Error ? cause.message : "";
  if (!code && message && !message.includes("_")) return message;
  return internalError(cause);
}

async function context() {
  const tenant = await getCurrentTenant();
  if (!tenant) return { error: "Empresa não resolvida." as const };
  const session = await getSession();
  if (!session?.user) return { error: "Sessão expirada." as const };
  return { tenant, userId: session.user.id };
}

function generateCode(): string {
  const raw = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `GC-${raw.slice(0, 5)}-${raw.slice(5)}`;
}

const giftCardInput = z.object({
  value: z.string().trim(),
  clientId: z.string().trim().optional(),
  expiresAt: z.string().trim().optional(),
});

export async function createGiftCardAction(
  _prev: LoyaltyActionState,
  formData: FormData,
): Promise<LoyaltyActionState> {
  const parsed = giftCardInput.safeParse({
    value: formData.get("value") ?? "",
    clientId: formData.get("clientId") ?? "",
    expiresAt: formData.get("expiresAt") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const valueCents = parsePriceToCents(parsed.data.value);
  if (valueCents === null || valueCents <= 0) {
    return { status: "error", fieldErrors: { value: ["Valor inválido."] } };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  let createdCode = "";
  try {
    createdCode = await withUser(ctx.userId, async (tx) => {
      const liability = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "liability_gift_card",
      );
      const cash = await getSystemAccountId(tx, ctx.tenant.id, "cash");
      if (!liability || !cash) {
        throw new Error("Crie o plano de contas padrão em Financeiro.");
      }

      const [card] = await tx
        .insert(giftCards)
        .values({
          tenantId: ctx.tenant.id,
          code: generateCode(),
          initialValueCents: valueCents,
          clientId: isUuid(parsed.data.clientId ?? "")
            ? parsed.data.clientId
            : null,
          expiresAt: parsed.data.expiresAt
            ? new Date(`${parsed.data.expiresAt}T23:59:59Z`)
            : null,
          createdBy: ctx.userId,
        })
        .returning({ id: giftCards.id, code: giftCards.code });

      const entryId = await postEntry(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        description: `Venda de gift card ${card.code}`,
        idempotencyKey: `gift-card-sale-${card.id}`,
        referenceType: "gift_card",
        referenceId: card.id,
        lines: [
          { accountId: cash, direction: "debit", amountCents: valueCents },
          { accountId: liability, direction: "credit", amountCents: valueCents },
        ],
      });

      await tx
        .update(giftCards)
        .set({ entryId })
        .where(eq(giftCards.id, card.id));

      return card.code;
    });
  } catch (cause) {
    return { status: "error", message: friendly(cause) };
  }

  revalidatePath("/loyalty");
  return { status: "success", message: `Gift card criado: ${createdCode}` };
}

const redeemGiftCardInput = z.object({
  code: z.string().trim().min(1, "Informe o código."),
  amount: z.string().trim(),
  clientId: z.string().trim().optional(),
});

export async function redeemGiftCardAction(
  _prev: LoyaltyActionState,
  formData: FormData,
): Promise<LoyaltyActionState> {
  const parsed = redeemGiftCardInput.safeParse({
    code: formData.get("code") ?? "",
    amount: formData.get("amount") ?? "",
    clientId: formData.get("clientId") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const amountCents = parsePriceToCents(parsed.data.amount);
  if (amountCents === null || amountCents <= 0) {
    return { status: "error", fieldErrors: { amount: ["Valor inválido."] } };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    await withUser(ctx.userId, async (tx) => {
      const [card] = await tx
        .select({
          id: giftCards.id,
          initialValueCents: giftCards.initialValueCents,
          status: giftCards.status,
          expiresAt: giftCards.expiresAt,
        })
        .from(giftCards)
        .where(
          and(
            eq(giftCards.tenantId, ctx.tenant.id),
            eq(sql`lower(${giftCards.code})`, parsed.data.code.toLowerCase()),
          ),
        )
        .limit(1);
      if (!card) throw new Error("Gift card não encontrado.");
      if (card.status !== "active") throw new Error("Gift card não está ativo.");
      if (card.expiresAt && card.expiresAt.getTime() < Date.now()) {
        throw new Error("Gift card expirado.");
      }

      const redemptions = await tx
        .select({ amountCents: giftCardRedemptions.amountCents })
        .from(giftCardRedemptions)
        .where(eq(giftCardRedemptions.giftCardId, card.id));
      const redeemed = redemptions.reduce(
        (sum, row) => sum + row.amountCents,
        0,
      );
      const balance = Math.max(0, card.initialValueCents - redeemed);
      if (amountCents > balance) {
        throw new Error("Valor maior que o saldo do gift card.");
      }

      const liability = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "liability_gift_card",
      );
      const revenue = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "revenue_gift_card",
      );
      if (!liability || !revenue) {
        throw new Error("Crie o plano de contas padrão em Financeiro.");
      }

      const [redemption] = await tx
        .insert(giftCardRedemptions)
        .values({
          tenantId: ctx.tenant.id,
          giftCardId: card.id,
          clientId: isUuid(parsed.data.clientId ?? "")
            ? parsed.data.clientId
            : null,
          amountCents,
          createdBy: ctx.userId,
        })
        .returning({ id: giftCardRedemptions.id });

      const entryId = await postEntry(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        description: "Resgate de gift card",
        idempotencyKey: `gift-card-redeem-${redemption.id}`,
        referenceType: "gift_card_redemption",
        referenceId: redemption.id,
        lines: [
          { accountId: liability, direction: "debit", amountCents },
          { accountId: revenue, direction: "credit", amountCents },
        ],
      });

      await tx
        .update(giftCardRedemptions)
        .set({ entryId })
        .where(eq(giftCardRedemptions.id, redemption.id));

      if (amountCents >= balance) {
        await tx
          .update(giftCards)
          .set({ status: "redeemed" })
          .where(eq(giftCards.id, card.id));
      }
    });
  } catch (cause) {
    return { status: "error", message: friendly(cause) };
  }

  revalidatePath("/loyalty");
  return { status: "success", message: "Gift card resgatado." };
}

const settingsInput = z.object({
  pointsPerReal: z.coerce
    .number()
    .int("Use um número inteiro.")
    .min(0, "Não pode ser negativo.")
    .max(1000, "Valor muito alto."),
  redeemPointsPerReal: z.coerce
    .number()
    .int("Use um número inteiro.")
    .min(1, "Ao menos 1 ponto.")
    .max(1000000, "Valor muito alto."),
});

export async function saveLoyaltySettingsAction(
  _prev: LoyaltyActionState,
  formData: FormData,
): Promise<LoyaltyActionState> {
  const parsed = settingsInput.safeParse({
    pointsPerReal: formData.get("pointsPerReal") ?? "1",
    redeemPointsPerReal: formData.get("redeemPointsPerReal") ?? "100",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const isActive = formData.get("isActive") === "on";

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    await withUser(ctx.userId, async (tx) => {
      await tx
        .insert(loyaltySettings)
        .values({
          tenantId: ctx.tenant.id,
          isActive,
          pointsPerReal: parsed.data.pointsPerReal,
          redeemPointsPerReal: parsed.data.redeemPointsPerReal,
        })
        .onConflictDoUpdate({
          target: loyaltySettings.tenantId,
          set: {
            isActive,
            pointsPerReal: parsed.data.pointsPerReal,
            redeemPointsPerReal: parsed.data.redeemPointsPerReal,
          },
        });
    });
  } catch (cause) {
    return { status: "error", message: friendly(cause) };
  }

  revalidatePath("/loyalty");
  return { status: "success", message: "Configurações salvas." };
}

const redeemPointsInput = z.object({
  clientId: z.string().trim(),
  points: z.coerce
    .number()
    .int("Use pontos inteiros.")
    .min(1, "Informe ao menos 1 ponto.")
    .max(100000000, "Valor muito alto."),
});

export async function redeemPointsAction(
  _prev: LoyaltyActionState,
  formData: FormData,
): Promise<LoyaltyActionState> {
  const parsed = redeemPointsInput.safeParse({
    clientId: formData.get("clientId") ?? "",
    points: formData.get("points") ?? "0",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  if (!isUuid(parsed.data.clientId)) {
    return { status: "error", message: "Cliente inválido." };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    await withUser(ctx.userId, async (tx) => {
      const settings = await getLoyaltySettings(tx, ctx.tenant.id);
      if (!settings?.isActive) {
        throw new Error("O programa de pontos está desativado.");
      }

      const rows = await tx
        .select({ pointsDelta: loyaltyPoints.pointsDelta })
        .from(loyaltyPoints)
        .where(
          and(
            eq(loyaltyPoints.tenantId, ctx.tenant.id),
            eq(loyaltyPoints.clientId, parsed.data.clientId),
          ),
        );
      const balance = rows.reduce((sum, row) => sum + row.pointsDelta, 0);
      if (parsed.data.points > balance) {
        throw new Error("Pontos insuficientes.");
      }

      const creditCents = creditCentsForPoints(
        parsed.data.points,
        settings.redeemPointsPerReal,
      );
      if (creditCents <= 0) {
        throw new Error("Pontos insuficientes para gerar crédito.");
      }

      const expense = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "expense_loyalty",
      );
      const wallet = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "liability_wallet",
      );
      if (!expense || !wallet) {
        throw new Error("Crie o plano de contas padrão em Financeiro.");
      }

      const redemptionId = randomUUID();
      const entryId = await postEntry(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        description: "Resgate de pontos de fidelidade",
        idempotencyKey: `loyalty-redeem-${redemptionId}`,
        referenceType: "loyalty_redemption",
        referenceId: redemptionId,
        lines: [
          { accountId: expense, direction: "debit", amountCents: creditCents },
          { accountId: wallet, direction: "credit", amountCents: creditCents },
        ],
      });

      await tx.insert(walletTransactions).values({
        tenantId: ctx.tenant.id,
        clientId: parsed.data.clientId,
        amountCents: creditCents,
        kind: "topup",
        referenceType: "loyalty_redemption",
        referenceId: redemptionId,
        entryId,
        createdBy: ctx.userId,
      });

      await tx.insert(loyaltyPoints).values({
        tenantId: ctx.tenant.id,
        clientId: parsed.data.clientId,
        pointsDelta: -parsed.data.points,
        kind: "redeem",
        referenceType: "loyalty_redemption",
        referenceId: redemptionId,
        createdBy: ctx.userId,
      });
    });
  } catch (cause) {
    return { status: "error", message: friendly(cause) };
  }

  revalidatePath("/loyalty");
  return { status: "success", message: "Pontos resgatados na carteira." };
}

const CAMPAIGN_SEGMENTS = [
  "todos",
  "novo",
  "ativo",
  "em_risco",
  "inativo",
  "vip",
  "aniversariantes",
] as const;

const campaignInput = z.object({
  name: z.string().trim().min(2, "Informe um nome.").max(120, "Máximo 120."),
  segment: z.enum(CAMPAIGN_SEGMENTS),
  subject: z.string().trim().min(2, "Informe o assunto.").max(160, "Máximo 160."),
  body: z.string().trim().min(2, "Informe a mensagem.").max(5000, "Máximo 5000."),
});

type Recipient = { id: string; name: string; email: string };

async function segmentRecipients(
  tx: AppTx,
  tenantId: string,
  segment: (typeof CAMPAIGN_SEGMENTS)[number],
  now: Date,
): Promise<Recipient[]> {
  const clientRows = await tx
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      birthday: clients.birthday,
    })
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, tenantId),
        eq(clients.isActive, true),
        eq(clients.marketingOptIn, true),
        sql`${clients.email} is not null`,
      ),
    );
  if (clientRows.length === 0) return [];

  const visitRows = await tx
    .select({
      clientId: appointments.clientId,
      lastVisitAt: sql<string | null>`max(${appointments.startsAt})`,
      visits: sql<number>`count(*)::int`,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        notInArray(appointments.status, ["cancelled", "no_show"]),
      ),
    )
    .groupBy(appointments.clientId);

  const spendRows = await tx
    .select({
      clientId: charges.clientId,
      total: sql<string>`coalesce(sum(${payments.amountCents}), 0)`,
    })
    .from(payments)
    .innerJoin(charges, eq(charges.id, payments.chargeId))
    .where(
      and(eq(payments.tenantId, tenantId), eq(payments.status, "confirmed")),
    )
    .groupBy(charges.clientId);

  const visitById = new Map(
    visitRows.map((row) => [
      row.clientId,
      {
        visits: Number(row.visits),
        lastVisitAt: row.lastVisitAt ? new Date(row.lastVisitAt) : null,
      },
    ]),
  );
  const spendById = new Map(
    spendRows
      .filter((row) => row.clientId)
      .map((row) => [row.clientId as string, Number(row.total)]),
  );

  const threshold = vipThresholdCents(
    clientRows.map((row) => spendById.get(row.id) ?? 0),
  );
  const currentMonth = now.getUTCMonth() + 1;

  return clientRows.filter((row) => {
    const visit = visitById.get(row.id) ?? { visits: 0, lastVisitAt: null };
    const metrics = {
      visits: visit.visits,
      firstVisitAt: null,
      lastVisitAt: visit.lastVisitAt,
    };
    switch (segment) {
      case "todos":
        return true;
      case "vip":
        return isVip(spendById.get(row.id) ?? 0, threshold);
      case "aniversariantes":
        return row.birthday
          ? Number(row.birthday.slice(5, 7)) === currentMonth
          : false;
      default:
        return classifyClient(metrics, now) === segment;
    }
  }) as Recipient[];
}

export async function sendCampaignAction(
  _prev: LoyaltyActionState,
  formData: FormData,
): Promise<LoyaltyActionState> {
  const parsed = campaignInput.safeParse({
    name: formData.get("name") ?? "",
    segment: formData.get("segment") ?? "todos",
    subject: formData.get("subject") ?? "",
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const count = await withUser(ctx.userId, async (tx) => {
      const recipients = await segmentRecipients(
        tx,
        ctx.tenant.id,
        parsed.data.segment,
        new Date(),
      );

      await tx.insert(campaigns).values({
        tenantId: ctx.tenant.id,
        name: parsed.data.name,
        segment: parsed.data.segment,
        subject: parsed.data.subject,
        body: parsed.data.body,
        audienceCount: recipients.length,
        sentCount: recipients.length,
        createdBy: ctx.userId,
      });

      for (const recipient of recipients) {
        await enqueueEmail(tx, {
          tenantId: ctx.tenant.id,
          recipient: recipient.email,
          subject: parsed.data.subject,
          body: parsed.data.body,
          createdBy: ctx.userId,
        });
      }

      return recipients.length;
    });

    revalidatePath("/loyalty");
    revalidatePath("/notifications");
    return {
      status: "success",
      message: `Campanha enfileirada para ${count} cliente(s).`,
    };
  } catch (cause) {
    return { status: "error", message: friendly(cause) };
  }
}
