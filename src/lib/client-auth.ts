import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import {
  appointments,
  branches,
  clientOtpCodes,
  clientSessions,
  clients,
  professionals,
  services,
  tenants,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { getAppEnv } from "@/lib/app-env";
import { buildClientOtpEmail } from "@/lib/auth-emails";
import {
  CLIENT_OTP_MAX_ATTEMPTS,
  CLIENT_OTP_TTL_SECONDS,
  clientOtpExpiry,
  clientSessionExpiry,
  generateOtp,
  generateSessionToken,
  hashOtp,
  hashSessionToken,
  isExpired,
  normalizeEmail,
  otpMatches,
} from "@/lib/client-auth-tokens";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { isUuid } from "@/lib/validation";

export type ClientTenant = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

export type ClientIdentity = {
  id: string | null;
  name: string;
  email: string;
  phone: string | null;
};

export type ClientContext = {
  sessionId: string;
  email: string;
  tenant: ClientTenant;
  client: ClientIdentity;
};

export type VerifyClientOtpResult =
  | {
      ok: true;
      token: string;
      expiresAt: Date;
      client: ClientIdentity;
      tenant: ClientTenant;
    }
  | { ok: false; reason: "invalid" | "expired" | "too_many" };

function lowerEmail(column: typeof clients.email, email: string) {
  return sql`lower(${column}) = ${email}`;
}

async function findClient(
  tenantId: string,
  email: string,
): Promise<ClientIdentity | null> {
  const [row] = await getDb()
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      phone: clients.phone,
    })
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, tenantId),
        lowerEmail(clients.email, email),
        eq(clients.isActive, true),
      ),
    )
    .orderBy(desc(clients.createdAt))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? email,
    phone: row.phone,
  };
}

async function findActiveTenant(tenantId: string): Promise<ClientTenant | null> {
  const [row] = await getDb()
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      logoUrl: tenants.logoUrl,
    })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.isActive, true)))
    .limit(1);
  return row ?? null;
}

function fallbackClient(email: string): ClientIdentity {
  return {
    id: null,
    name: email.split("@")[0] ?? email,
    email,
    phone: null,
  };
}

/**
 * Cria um codigo OTP para o e-mail informado. Se o e-mail nao pertencer a um
 * cliente do tenant, devolve a mesma resposta (sem revelar a existencia).
 */
export async function requestClientOtp(params: {
  tenant: ClientTenant;
  email: string;
}): Promise<{ ok: true; expiresInSeconds: number; devCode?: string }> {
  const email = normalizeEmail(params.email);
  const client = await findClient(params.tenant.id, email);
  if (!client) {
    return { ok: true, expiresInSeconds: CLIENT_OTP_TTL_SECONDS };
  }

  const now = new Date();
  const code = generateOtp();
  const codeHash = hashOtp({
    tenantId: params.tenant.id,
    email,
    code,
  });

  await getDb().transaction(async (tx) => {
    await tx
      .delete(clientOtpCodes)
      .where(
        and(
          eq(clientOtpCodes.tenantId, params.tenant.id),
          eq(clientOtpCodes.email, email),
        ),
      );
    await tx.insert(clientOtpCodes).values({
      tenantId: params.tenant.id,
      email,
      codeHash,
      expiresAt: clientOtpExpiry(now),
    });
  });

  const built = buildClientOtpEmail({
    tenantName: params.tenant.name,
    code,
    minutes: Math.round(CLIENT_OTP_TTL_SECONDS / 60),
  });
  const delivery = await sendEmail({
    to: email,
    subject: built.subject,
    html: built.html,
  });
  if (!delivery.ok) {
    logger.error("client_otp_email_failed", {
      tenantId: params.tenant.id,
      error: delivery.error,
    });
  }

  const devCode =
    getAppEnv() !== "production" && !process.env.RESEND_API_KEY
      ? code
      : undefined;
  if (devCode) {
    console.log(`[client-otp:dev] tenant=${params.tenant.id} code=${devCode}`);
  }

  return {
    ok: true,
    expiresInSeconds: CLIENT_OTP_TTL_SECONDS,
    ...(devCode ? { devCode } : {}),
  };
}

/**
 * Valida o codigo e cria uma sessao Bearer do cliente. O codigo e consumido
 * mesmo quando errado (apos o limite de tentativas) e a comparacao e constante.
 */
export async function verifyClientOtp(params: {
  tenant: ClientTenant;
  email: string;
  code: string;
}): Promise<VerifyClientOtpResult> {
  const email = normalizeEmail(params.email);
  const client = await findClient(params.tenant.id, email);
  if (!client) return { ok: false, reason: "invalid" };
  const now = new Date();

  const outcome = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: clientOtpCodes.id,
        codeHash: clientOtpCodes.codeHash,
        attempts: clientOtpCodes.attempts,
        expiresAt: clientOtpCodes.expiresAt,
      })
      .from(clientOtpCodes)
      .where(
        and(
          eq(clientOtpCodes.tenantId, params.tenant.id),
          eq(clientOtpCodes.email, email),
          isNull(clientOtpCodes.consumedAt),
        ),
      )
      .orderBy(desc(clientOtpCodes.createdAt))
      .limit(1)
      .for("update");

    if (!row) return { ok: false, reason: "invalid" } as const;

    if (isExpired(row.expiresAt, now)) {
      await tx
        .update(clientOtpCodes)
        .set({ consumedAt: now })
        .where(eq(clientOtpCodes.id, row.id));
      return { ok: false, reason: "expired" } as const;
    }

    if (row.attempts >= CLIENT_OTP_MAX_ATTEMPTS) {
      await tx
        .update(clientOtpCodes)
        .set({ consumedAt: now })
        .where(eq(clientOtpCodes.id, row.id));
      return { ok: false, reason: "too_many" } as const;
    }

    const nextAttempts = row.attempts + 1;
    const matched = otpMatches({
      storedHash: row.codeHash,
      tenantId: params.tenant.id,
      email,
      code: params.code,
    });

    if (!matched) {
      const tooMany = nextAttempts >= CLIENT_OTP_MAX_ATTEMPTS;
      await tx
        .update(clientOtpCodes)
        .set({
          attempts: nextAttempts,
          consumedAt: tooMany ? now : null,
        })
        .where(eq(clientOtpCodes.id, row.id));
      return {
        ok: false,
        reason: tooMany ? "too_many" : "invalid",
      } as const;
    }

    await tx
      .update(clientOtpCodes)
      .set({ attempts: nextAttempts, consumedAt: now })
      .where(eq(clientOtpCodes.id, row.id));

    const token = generateSessionToken();
    const expiresAt = clientSessionExpiry(now);
    await tx.insert(clientSessions).values({
      tenantId: params.tenant.id,
      email,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });

    return { ok: true, token, expiresAt } as const;
  });

  if (!outcome.ok) return outcome;

  return {
    ok: true,
    token: outcome.token,
    expiresAt: outcome.expiresAt,
    client,
    tenant: params.tenant,
  };
}

/** Le o Bearer do cliente, valida a sessao e devolve tenant + identidade. */
export async function requireClientContext(
  request: Request,
): Promise<ClientContext> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    throw new ApiError(401, "UNAUTHORIZED", "Sessão ausente ou expirada.");
  }

  const tokenHash = hashSessionToken(match[1].trim());
  const now = new Date();
  const [session] = await getDb()
    .select({
      id: clientSessions.id,
      tenantId: clientSessions.tenantId,
      email: clientSessions.email,
      expiresAt: clientSessions.expiresAt,
      revokedAt: clientSessions.revokedAt,
    })
    .from(clientSessions)
    .where(eq(clientSessions.tokenHash, tokenHash))
    .limit(1);

  if (
    !session ||
    session.revokedAt ||
    isExpired(session.expiresAt, now)
  ) {
    throw new ApiError(401, "UNAUTHORIZED", "Sessão ausente ou expirada.");
  }

  const tenant = await findActiveTenant(session.tenantId);
  if (!tenant) {
    throw new ApiError(401, "UNAUTHORIZED", "Empresa indisponível.");
  }

  await getDb()
    .update(clientSessions)
    .set({ lastUsedAt: now })
    .where(eq(clientSessions.id, session.id));

  const client =
    (await findClient(tenant.id, session.email)) ??
    fallbackClient(session.email);

  return {
    sessionId: session.id,
    email: session.email,
    tenant,
    client,
  };
}

/** Empresas em que o e-mail tem cadastro de cliente ativo. */
export async function listClientTenants(
  email: string,
): Promise<ClientTenant[]> {
  const normalized = normalizeEmail(email);
  return getDb()
    .selectDistinct({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      logoUrl: tenants.logoUrl,
    })
    .from(clients)
    .innerJoin(tenants, eq(clients.tenantId, tenants.id))
    .where(
      and(
        lowerEmail(clients.email, normalized),
        eq(clients.isActive, true),
        eq(tenants.isActive, true),
      ),
    )
    .orderBy(asc(tenants.name));
}

/**
 * Troca a empresa do cliente: valida o cadastro e cria uma nova sessao,
 * revogando a anterior. O mesmo e-mail e a identidade entre tenants.
 */
export async function switchClientTenant(
  ctx: ClientContext,
  tenantId: string,
): Promise<{
  token: string;
  expiresAt: Date;
  client: ClientIdentity;
  tenant: ClientTenant;
  tenants: ClientTenant[];
}> {
  if (!isUuid(tenantId)) {
    throw new ApiError(400, "INVALID_TENANT", "tenantId inválido.");
  }

  const client = await findClient(tenantId, ctx.email);
  if (!client) {
    throw new ApiError(
      403,
      "TENANT_FORBIDDEN",
      "Este e-mail não tem cadastro nesta empresa.",
    );
  }

  const tenant = await findActiveTenant(tenantId);
  if (!tenant) {
    throw new ApiError(404, "TENANT_NOT_FOUND", "Empresa não encontrada.");
  }

  const now = new Date();
  const token = generateSessionToken();
  const expiresAt = clientSessionExpiry(now);

  await getDb().transaction(async (tx) => {
    await tx.insert(clientSessions).values({
      tenantId,
      email: ctx.email,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });
    await tx
      .update(clientSessions)
      .set({ revokedAt: now })
      .where(eq(clientSessions.id, ctx.sessionId));
  });

  return {
    token,
    expiresAt,
    client,
    tenant,
    tenants: await listClientTenants(ctx.email),
  };
}

export async function logoutClientSession(sessionId: string): Promise<void> {
  await getDb()
    .update(clientSessions)
    .set({ revokedAt: new Date() })
    .where(eq(clientSessions.id, sessionId));
}

export type ClientAppointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  priceCents: number;
  notes: string | null;
  branch: { id: string; name: string; timezone: string };
  professional: { id: string; name: string };
  service: { id: string; name: string };
};

/** Historico/agenda do proprio cliente (todos os cadastros com o mesmo e-mail). */
export async function listClientAppointments(
  ctx: ClientContext,
  range: { from: Date; to: Date },
): Promise<ClientAppointment[]> {
  const rows = await getDb()
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      priceCents: appointments.priceCents,
      notes: appointments.notes,
      branch: {
        id: branches.id,
        name: branches.name,
        timezone: branches.timezone,
      },
      professional: { id: professionals.id, name: professionals.name },
      service: { id: services.id, name: services.name },
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(branches, eq(branches.id, appointments.branchId))
    .innerJoin(
      professionals,
      eq(professionals.id, appointments.professionalId),
    )
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.tenantId, ctx.tenant.id),
        lowerEmail(clients.email, ctx.email),
        gte(appointments.startsAt, range.from),
        lte(appointments.startsAt, range.to),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(100);

  return rows.map((row) => ({
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  }));
}
