import { z } from "zod";
import { apiError, apiJson, apiPreflight, handleApi } from "@/lib/api";
import { listClientTenants, verifyClientOtp } from "@/lib/client-auth";
import { normalizeEmail } from "@/lib/client-auth-tokens";
import { resolvePublicTenant } from "@/lib/public-api";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().trim().regex(/^\d{6}$/),
});

/** Valida o codigo OTP e devolve o token Bearer do cliente final. */
export const POST = handleApi(async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      request,
      400,
      "INVALID_BODY",
      "Informe o e-mail e o código de 6 dígitos.",
    );
  }

  const tenant = await resolvePublicTenant(request);
  const email = normalizeEmail(parsed.data.email);

  const ipLimit = await checkRateLimit({
    key: clientKey(request.headers, "api:client-otp:verify"),
    limit: 15,
    windowSeconds: 600,
  });
  const emailLimit = await checkRateLimit({
    key: `api:client-otp:verify:${tenant.id}:${email}`,
    limit: 10,
    windowSeconds: 600,
  });
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return apiError(
      request,
      429,
      "RATE_LIMITED",
      "Muitas tentativas. Aguarde alguns minutos.",
    );
  }

  const result = await verifyClientOtp({
    tenant,
    email,
    code: parsed.data.code,
  });

  if (!result.ok) {
    if (result.reason === "expired") {
      return apiError(
        request,
        400,
        "CODE_EXPIRED",
        "O código expirou. Peça um novo.",
      );
    }
    if (result.reason === "too_many") {
      return apiError(
        request,
        429,
        "TOO_MANY_ATTEMPTS",
        "Muitas tentativas. Peça um novo código.",
      );
    }
    return apiError(request, 400, "INVALID_CODE", "Código inválido.");
  }

  return apiJson(request, {
    token: result.token,
    expiresAt: result.expiresAt.toISOString(),
    client: result.client,
    tenant: result.tenant,
    tenants: await listClientTenants(email),
  });
});

export const OPTIONS = apiPreflight;
