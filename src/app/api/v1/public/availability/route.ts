import {
  apiError,
  apiJson,
  apiPreflight,
  handleApi,
} from "@/lib/api";
import { computeSlotsForDay } from "@/lib/availability-data";
import { getDb } from "@/lib/db";
import { resolvePublicTenant } from "@/lib/public-api";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { isUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = handleApi(async (request) => {
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? "";
  const professionalId = url.searchParams.get("professionalId") ?? "";
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const date = url.searchParams.get("date") ?? "";

  if (
    !isUuid(branchId) ||
    !isUuid(professionalId) ||
    !isUuid(serviceId) ||
    !DATE_RE.test(date)
  ) {
    return apiError(
      request,
      400,
      "INVALID_PARAMS",
      "Informe branchId, professionalId, serviceId e date (YYYY-MM-DD).",
    );
  }

  const limited = await checkRateLimit({
    key: clientKey(request.headers, "api:availability"),
    limit: 60,
    windowSeconds: 60,
  });
  if (!limited.allowed) {
    return apiError(
      request,
      429,
      "RATE_LIMITED",
      "Muitas consultas. Aguarde um instante.",
    );
  }

  const tenant = await resolvePublicTenant(request);
  const result = await getDb().transaction((tx) =>
    computeSlotsForDay(tx, tenant.id, {
      branchId,
      professionalId,
      serviceId,
      date,
    }),
  );

  if ("error" in result) {
    return apiError(request, 400, "UNAVAILABLE", result.error);
  }

  return apiJson(request, {
    date,
    slots: result.slots,
    durationMinutes: result.durationMinutes,
    priceCents: result.priceCents,
    timezone: result.timezone,
  });
});

export const OPTIONS = apiPreflight;
