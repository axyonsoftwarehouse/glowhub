import { eq } from "drizzle-orm";
import { loyaltyPoints, loyaltySettings } from "@/db/schema";
import type { AppTx } from "@/lib/db";

/** Pontos ganhos por um valor gasto (centavos), arredondando para baixo. */
export function pointsForAmount(
  amountCents: number,
  pointsPerReal: number,
): number {
  if (amountCents <= 0 || pointsPerReal <= 0) return 0;
  return Math.floor((amountCents * pointsPerReal) / 100);
}

/** Credito em centavos ao resgatar pontos (arredondando para baixo). */
export function creditCentsForPoints(
  points: number,
  redeemPointsPerReal: number,
): number {
  if (points <= 0 || redeemPointsPerReal <= 0) return 0;
  return Math.floor((points * 100) / redeemPointsPerReal);
}

/** Saldo do gift card = valor inicial - resgates. */
export function giftCardBalance(
  initialValueCents: number,
  redeemedCents: number,
): number {
  return Math.max(0, initialValueCents - redeemedCents);
}

export type LoyaltySettingsRow = {
  isActive: boolean;
  pointsPerReal: number;
  redeemPointsPerReal: number;
};

export async function getLoyaltySettings(
  tx: AppTx,
  tenantId: string,
): Promise<LoyaltySettingsRow | null> {
  const [row] = await tx
    .select({
      isActive: loyaltySettings.isActive,
      pointsPerReal: loyaltySettings.pointsPerReal,
      redeemPointsPerReal: loyaltySettings.redeemPointsPerReal,
    })
    .from(loyaltySettings)
    .where(eq(loyaltySettings.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

/**
 * Credita pontos de fidelidade por uma comanda quitada. Idempotente por
 * (comanda, earn). Retorna os pontos creditados (0 se desativado ou repetido).
 */
export async function awardChargePoints(
  tx: AppTx,
  params: {
    tenantId: string;
    userId: string;
    chargeId: string;
    clientId: string;
    amountCents: number;
  },
): Promise<number> {
  const settings = await getLoyaltySettings(tx, params.tenantId);
  if (!settings?.isActive) return 0;

  const points = pointsForAmount(params.amountCents, settings.pointsPerReal);
  if (points <= 0) return 0;

  const inserted = await tx
    .insert(loyaltyPoints)
    .values({
      tenantId: params.tenantId,
      clientId: params.clientId,
      pointsDelta: points,
      kind: "earn",
      referenceType: "charge",
      referenceId: params.chargeId,
      createdBy: params.userId,
    })
    .onConflictDoNothing()
    .returning({ id: loyaltyPoints.id });

  return inserted.length > 0 ? points : 0;
}
