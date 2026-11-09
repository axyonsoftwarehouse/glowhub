"use server";

import { internalError } from "@/lib/errors";

import { headers } from "next/headers";
import { computeSlotsForDay } from "@/lib/availability-data";
import { getDb } from "@/lib/db";
import {
  createPublicBooking,
  type PublicBookingInput,
  type PublicBookingResult,
} from "@/lib/public-booking";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { getPublicTenant } from "@/lib/tenant";

export type { PublicBookingResult } from "@/lib/public-booking";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function withinRateLimit(
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const result = await checkRateLimit({
    key: clientKey(await headers(), scope),
    limit,
    windowSeconds,
  });
  return result.allowed;
}

export async function getPublicAvailabilityAction(input: {
  branchId: string;
  professionalId: string;
  serviceId: string;
  date: string;
}): Promise<{ slots: string[] } | { error: string }> {
  if (
    !UUID_RE.test(input.branchId) ||
    !UUID_RE.test(input.professionalId) ||
    !UUID_RE.test(input.serviceId) ||
    !DATE_RE.test(input.date)
  ) {
    return { error: "Dados inválidos." };
  }

  if (!(await withinRateLimit("book:availability", 60, 60))) {
    return { error: "Muitas solicitações. Aguarde um instante." };
  }

  const tenant = await getPublicTenant();
  if (!tenant) return { error: "Empresa não encontrada." };

  try {
    const result = await getDb().transaction((tx) =>
      computeSlotsForDay(tx, tenant.id, input),
    );
    if ("error" in result) return result;
    return { slots: result.slots };
  } catch (cause) {
    return { error: internalError(cause) };
  }
}

export async function createPublicBookingAction(
  input: PublicBookingInput,
): Promise<PublicBookingResult> {
  if (!(await withinRateLimit("book:create", 10, 600))) {
    return { error: "Muitas solicitações. Tente novamente mais tarde." };
  }

  const tenant = await getPublicTenant();
  if (!tenant) return { error: "Empresa não encontrada." };

  return createPublicBooking({ tenant, input });
}
