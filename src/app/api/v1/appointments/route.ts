import { and, asc, eq, gte, lte } from "drizzle-orm";
import {
  appointments,
  branches,
  clients,
  professionals,
  services,
} from "@/db/schema";
import {
  apiError,
  apiJson,
  apiPreflight,
  ApiError,
  handleApi,
  readString,
  requireApiContext,
} from "@/lib/api";
import { withUser } from "@/lib/db";
import { isUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

const STATUSES = [
  "pending",
  "confirmed",
  "check_in",
  "checkout",
  "completed",
  "cancelled",
  "no_show",
] as const;

type AppointmentStatus = (typeof STATUSES)[number];

export const GET = handleApi(async (request) => {
  const ctx = await requireApiContext(request);
  const searchParams = new URL(request.url).searchParams;

  const now = new Date();
  const fromRaw = readString(searchParams, "from", 40);
  const toRaw = readString(searchParams, "to", 40);
  const from = fromRaw
    ? new Date(fromRaw)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = toRaw
    ? new Date(toRaw)
    : new Date(from.getTime() + 7 * 86_400_000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return apiError(
      request,
      400,
      "INVALID_RANGE",
      "Use from/to em ISO 8601 (ex.: 2026-11-09).",
    );
  }
  if (to <= from) {
    return apiError(request, 400, "INVALID_RANGE", "to deve ser depois de from.");
  }

  const statusRaw = readString(searchParams, "status", 20);
  let status: AppointmentStatus | undefined;
  if (statusRaw) {
    if (!STATUSES.includes(statusRaw as AppointmentStatus)) {
      return apiError(request, 400, "INVALID_STATUS", "Status inválido.");
    }
    status = statusRaw as AppointmentStatus;
  }

  let professionalId = readString(searchParams, "professionalId", 40);
  if (professionalId && !isUuid(professionalId)) {
    return apiError(
      request,
      400,
      "INVALID_PROFESSIONAL",
      "professionalId inválido.",
    );
  }

  if (searchParams.get("mine") === "1") {
    if (!ctx.professional) {
      throw new ApiError(
        403,
        "NOT_A_PROFESSIONAL",
        "Sua conta não está vinculada a um profissional.",
      );
    }
    professionalId = ctx.professional.id;
  }

  const limitRaw = Number(searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200)
    : 100;

  const conditions = [
    eq(appointments.tenantId, ctx.tenant.id),
    gte(appointments.startsAt, from),
    lte(appointments.startsAt, to),
  ];
  if (status) conditions.push(eq(appointments.status, status));
  if (professionalId) {
    conditions.push(eq(appointments.professionalId, professionalId));
  }

  const rows = await withUser(ctx.userId, (tx) =>
    tx
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        priceCents: appointments.priceCents,
        notes: appointments.notes,
        branch: { id: branches.id, name: branches.name },
        professional: { id: professionals.id, name: professionals.name },
        service: { id: services.id, name: services.name },
        client: { id: clients.id, name: clients.name, phone: clients.phone },
      })
      .from(appointments)
      .innerJoin(branches, eq(branches.id, appointments.branchId))
      .innerJoin(
        professionals,
        eq(professionals.id, appointments.professionalId),
      )
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .where(and(...conditions))
      .orderBy(asc(appointments.startsAt))
      .limit(limit),
  );

  return apiJson(request, {
    from: from.toISOString(),
    to: to.toISOString(),
    appointments: rows.map((row) => ({
      ...row,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
    })),
  });
});

export const OPTIONS = apiPreflight;
