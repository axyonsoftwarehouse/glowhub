import { auth } from "@/lib/auth";
import {
  apiJson,
  apiPreflight,
  handleApi,
  requireSession,
} from "@/lib/api";

export const dynamic = "force-dynamic";

/** Revoga a sessão atual (cookie ou Bearer). */
export const POST = handleApi(async (request) => {
  await requireSession(request);
  await auth.api.signOut({ headers: request.headers });
  return apiJson(request, { ok: true });
});

export const OPTIONS = apiPreflight;
