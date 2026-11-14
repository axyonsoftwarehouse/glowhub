import {
  apiError,
  apiJson,
  apiPreflight,
  handleApi,
  readString,
} from "@/lib/api";
import {
  listClientAppointments,
  requireClientContext,
} from "@/lib/client-auth";

export const dynamic = "force-dynamic";

/** Agenda/historico do cliente logado (padrao: -30 a +90 dias). */
export const GET = handleApi(async (request) => {
  const ctx = await requireClientContext(request);
  const searchParams = new URL(request.url).searchParams;

  const now = new Date();
  const fromRaw = readString(searchParams, "from", 40);
  const toRaw = readString(searchParams, "to", 40);
  const from = fromRaw
    ? new Date(fromRaw)
    : new Date(now.getTime() - 30 * 86_400_000);
  const to = toRaw
    ? new Date(toRaw)
    : new Date(now.getTime() + 90 * 86_400_000);

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

  return apiJson(request, {
    from: from.toISOString(),
    to: to.toISOString(),
    appointments: await listClientAppointments(ctx, { from, to }),
  });
});

export const OPTIONS = apiPreflight;
