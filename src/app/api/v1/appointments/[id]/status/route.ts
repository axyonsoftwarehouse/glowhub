import { revalidatePath } from "next/cache";
import {
  apiError,
  apiJson,
  apiPreflight,
  ApiError,
  handleApi,
  requireApiContext,
} from "@/lib/api";
import { setAppointmentStatus } from "@/lib/appointment-status";
import { withUser } from "@/lib/db";
import { isUuid } from "@/lib/validation";
import {
  ALLOWED_TRANSITIONS,
  type AppointmentStatus,
} from "@/app/(app)/appointments/types";

export const dynamic = "force-dynamic";

const STATUSES = Object.keys(ALLOWED_TRANSITIONS) as AppointmentStatus[];

export const PATCH = handleApi<{
  params: Promise<{ id: string }>;
}>(async (request, context) => {
  const ctx = await requireApiContext(request);
  const { id } = await context.params;
  if (!isUuid(id)) {
    throw new ApiError(400, "INVALID_ID", "Agendamento inválido.");
  }

  const body = (await request.json().catch(() => null)) as
    | { status?: unknown }
    | null;
  const status = typeof body?.status === "string" ? body.status : "";
  if (!STATUSES.includes(status as AppointmentStatus)) {
    throw new ApiError(400, "INVALID_STATUS", "Status inválido.");
  }

  const result = await withUser(ctx.userId, (tx) =>
    setAppointmentStatus(tx, {
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      appointmentId: id,
      status: status as AppointmentStatus,
    }),
  );

  if (!result.ok) {
    const httpStatus =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "CANCELLATION_WINDOW" ||
            result.code === "FORBIDDEN"
          ? 403
          : result.code === "INVALID_TRANSITION"
            ? 409
            : 500;
    return apiError(request, httpStatus, result.code, result.error);
  }

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  revalidatePath("/my-schedule");
  return apiJson(request, { ok: true, status: result.status });
});

export const OPTIONS = apiPreflight;
