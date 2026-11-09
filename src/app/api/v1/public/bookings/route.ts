import { z } from "zod";
import {
  apiError,
  apiJson,
  apiPreflight,
  handleApi,
} from "@/lib/api";
import { createPublicBooking } from "@/lib/public-booking";
import { resolvePublicTenant } from "@/lib/public-api";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bookingSchema = z.object({
  branchId: z.string().uuid(),
  professionalId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(30),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
});

export const POST = handleApi(async (request) => {
  const limited = await checkRateLimit({
    key: clientKey(request.headers, "api:booking"),
    limit: 10,
    windowSeconds: 600,
  });
  if (!limited.allowed) {
    return apiError(
      request,
      429,
      "RATE_LIMITED",
      "Muitas reservas. Tente novamente mais tarde.",
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      request,
      400,
      "INVALID_BODY",
      "Dados do agendamento inválidos.",
    );
  }

  const tenant = await resolvePublicTenant(request);
  const result = await createPublicBooking({
    tenant,
    input: {
      ...parsed.data,
      email: parsed.data.email || undefined,
    },
  });

  if ("error" in result) {
    const status = result.code === "SLOT_TAKEN" ? 409 : result.code === "UNKNOWN" ? 500 : 400;
    return apiError(
      request,
      status,
      result.code ?? "BOOKING_FAILED",
      result.error,
    );
  }

  return apiJson(
    request,
    {
      ok: true,
      label: result.label,
      tenant: { name: tenant.name, slug: tenant.slug },
    },
    201,
  );
});

export const OPTIONS = apiPreflight;
