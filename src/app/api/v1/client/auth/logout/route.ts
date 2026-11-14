import { apiJson, apiPreflight, handleApi } from "@/lib/api";
import {
  logoutClientSession,
  requireClientContext,
} from "@/lib/client-auth";

export const dynamic = "force-dynamic";

/** Revoga a sessao atual do cliente final. */
export const POST = handleApi(async (request) => {
  const ctx = await requireClientContext(request);
  await logoutClientSession(ctx.sessionId);
  return apiJson(request, { ok: true });
});

export const OPTIONS = apiPreflight;
