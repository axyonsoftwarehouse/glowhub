import { z } from "zod";
import { apiError, apiJson, apiPreflight, handleApi } from "@/lib/api";
import { requestClientOtp } from "@/lib/client-auth";
import { normalizeEmail } from "@/lib/client-auth-tokens";
import { resolvePublicTenant } from "@/lib/public-api";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().email().max(254),
});

/**
 * Pede um codigo OTP para o app do cliente final. A resposta e sempre generica
 * (nao revela se o e-mail tem cadastro). Em dev sem provedor de e-mail, o
 * codigo volta em `devCode` para testes.
 */
export const POST = handleApi(async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError(request, 400, "INVALID_BODY", "Informe um e-mail válido.");
  }

  const tenant = await resolvePublicTenant(request);
  const email = normalizeEmail(parsed.data.email);

  const ipLimit = await checkRateLimit({
    key: clientKey(request.headers, "api:client-otp:request"),
    limit: 5,
    windowSeconds: 600,
  });
  const emailLimit = await checkRateLimit({
    key: `api:client-otp:request:${tenant.id}:${email}`,
    limit: 3,
    windowSeconds: 600,
  });
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return apiError(
      request,
      429,
      "RATE_LIMITED",
      "Muitas solicitações. Aguarde alguns minutos.",
    );
  }

  const result = await requestClientOtp({ tenant, email });
  return apiJson(request, {
    ...result,
    tenant: { name: tenant.name, slug: tenant.slug },
  });
});

export const OPTIONS = apiPreflight;
