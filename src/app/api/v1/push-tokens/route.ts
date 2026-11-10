import {
  apiError,
  apiJson,
  apiPreflight,
  ApiError,
  handleApi,
  requireApiContext,
} from "@/lib/api";
import { getDb } from "@/lib/db";
import { isExpoPushToken } from "@/lib/push";
import { pushTokens } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const PLATFORMS = ["ios", "android", "web", "unknown"] as const;
type Platform = (typeof PLATFORMS)[number];

function readToken(body: unknown): { token: string; platform: Platform } {
  const record = body as { token?: unknown; platform?: unknown } | null;
  const token = typeof record?.token === "string" ? record.token.trim() : "";
  if (!isExpoPushToken(token)) {
    throw new ApiError(400, "INVALID_TOKEN", "Token de push inválido.");
  }
  const platform =
    typeof record?.platform === "string" &&
    PLATFORMS.includes(record.platform as Platform)
      ? (record.platform as Platform)
      : "unknown";
  return { token, platform };
}

/** Registra/atualiza o token Expo Push do aparelho no usuário/tenant ativo. */
export const POST = handleApi(async (request) => {
  const ctx = await requireApiContext(request);
  const body = await request.json().catch(() => null);
  const { token, platform } = readToken(body);

  await getDb()
    .insert(pushTokens)
    .values({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      token,
      platform,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        platform,
        lastSeenAt: new Date(),
      },
    });

  return apiJson(request, { ok: true }, 201);
});

/** Remove o token do usuário atual (ex.: logout do aparelho). */
export const DELETE = handleApi(async (request) => {
  const ctx = await requireApiContext(request);
  const body = await request.json().catch(() => null);
  const token =
    typeof (body as { token?: unknown } | null)?.token === "string"
      ? (body as { token: string }).token.trim()
      : "";
  if (!token) {
    return apiError(request, 400, "INVALID_TOKEN", "Informe o token.");
  }

  await getDb()
    .delete(pushTokens)
    .where(
      and(eq(pushTokens.token, token), eq(pushTokens.userId, ctx.userId)),
    );
  return apiJson(request, { ok: true });
});

export const OPTIONS = apiPreflight;
