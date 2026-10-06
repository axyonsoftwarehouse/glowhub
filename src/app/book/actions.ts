"use server";

import { internalError } from "@/lib/errors";

import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { appointments, clients } from "@/db/schema";
import { computeSlotsForDay } from "@/lib/availability-data";
import { getDb } from "@/lib/db";
import { enqueueEmail } from "@/lib/notifications";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { getPublicTenant } from "@/lib/tenant";
import { zonedTimeToUtc } from "@/lib/timezone";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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

export type PublicBookingResult =
  | { ok: true; label: string }
  | { error: string };

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

export async function createPublicBookingAction(input: {
  branchId: string;
  professionalId: string;
  serviceId: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
}): Promise<PublicBookingResult> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const email = (input.email ?? "").trim();

  if (
    !UUID_RE.test(input.branchId) ||
    !UUID_RE.test(input.professionalId) ||
    !UUID_RE.test(input.serviceId) ||
    !DATE_RE.test(input.date) ||
    !TIME_RE.test(input.time)
  ) {
    return { error: "Dados do agendamento inválidos." };
  }
  if (name.length < 2) return { error: "Informe seu nome." };
  if (phone.length < 8) return { error: "Informe um telefone válido." };

  if (!(await withinRateLimit("book:create", 10, 600))) {
    return { error: "Muitas solicitações. Tente novamente mais tarde." };
  }

  const tenant = await getPublicTenant();
  if (!tenant) return { error: "Empresa não encontrada." };

  try {
    const result = await getDb().transaction(async (tx) => {
      const ctx = await computeSlotsForDay(tx, tenant.id, {
        branchId: input.branchId,
        professionalId: input.professionalId,
        serviceId: input.serviceId,
        date: input.date,
      });
      if ("error" in ctx) return { error: ctx.error };
      if (!ctx.slots.includes(input.time)) {
        return { error: "Horário indisponível. Busque novamente." };
      }

      const [existing] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.tenantId, tenant.id),
            orPhoneOrEmail(phone, email),
          ),
        )
        .limit(1);

      let clientId = existing?.id ?? null;
      if (!clientId) {
        const [created] = await tx
          .insert(clients)
          .values({
            tenantId: tenant.id,
            name,
            phone,
            email: email.length > 0 ? email : null,
          })
          .returning({ id: clients.id });
        clientId = created.id;
      }

      const startsAt = zonedTimeToUtc(input.date, input.time, ctx.timezone);
      const endsAt = new Date(
        startsAt.getTime() + ctx.durationMinutes * 60_000,
      );

      await tx.insert(appointments).values({
        tenantId: tenant.id,
        branchId: input.branchId,
        professionalId: input.professionalId,
        serviceId: input.serviceId,
        clientId,
        startsAt,
        endsAt,
        priceCents: ctx.priceCents,
        status: "pending",
        notes:
          input.notes && input.notes.length > 0
            ? `Online: ${input.notes}`
            : "Agendamento online",
      });

      if (email.length > 0) {
        await enqueueEmail(tx, {
          tenantId: tenant.id,
          recipient: email,
          subject: `Agendamento confirmado - ${input.date} às ${input.time}`,
          body: `Olá ${name}, seu agendamento foi reservado para ${input.date} às ${input.time}. Até logo!`,
        });
      }

      return { ok: true as const };
    });

    if ("error" in result) {
      return { error: result.error ?? "Não foi possível concluir o agendamento." };
    }
    return {
      ok: true,
      label: `${input.date} às ${input.time}`,
    };
  } catch (cause) {
    const message = String(cause);
    if (message.includes("23P01")) {
      return { error: "Esse horário acabou de ser reservado. Escolha outro." };
    }
    return { error: "Não foi possível concluir o agendamento." };
  }
}

function orPhoneOrEmail(phone: string, email: string) {
  if (email.length > 0) {
    return sql`lower(${clients.email}) = lower(${email}) or ${clients.phone} = ${phone}`;
  }
  return sql`${clients.phone} = ${phone}`;
}
