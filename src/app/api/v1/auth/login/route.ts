import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  apiError,
  apiJson,
  apiPreflight,
  handleApi,
} from "@/lib/api";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

/**
 * Login do app mobile. Encapsula o Better Auth no servidor para não depender do
 * header `Origin` (que o fetch nativo não envia) e devolve o token de sessão,
 * usado como `Authorization: Bearer <token>` nas rotas /api/v1.
 */
export const POST = handleApi(async (request) => {
  const limited = await checkRateLimit({
    key: clientKey(request.headers, "api:login"),
    limit: 10,
    windowSeconds: 60,
  });
  if (!limited.allowed) {
    return apiError(
      request,
      429,
      "RATE_LIMITED",
      "Muitas tentativas. Aguarde um instante.",
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(request, 400, "INVALID_BODY", "Informe e-mail e senha.");
  }

  const origin =
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    new URL(request.url).origin;

  try {
    const result = await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: new Headers({
        origin,
        "content-type": "application/json",
      }),
    });

    return apiJson(request, {
      token: result.token,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
      },
    });
  } catch {
    return apiError(
      request,
      401,
      "INVALID_CREDENTIALS",
      "E-mail ou senha inválidos.",
    );
  }
});

export const OPTIONS = apiPreflight;
