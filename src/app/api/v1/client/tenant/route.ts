import { z } from "zod";
import { apiError, apiJson, apiPreflight, handleApi } from "@/lib/api";
import { requireClientContext, switchClientTenant } from "@/lib/client-auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  tenantId: z.string().uuid(),
});

/** Troca a empresa do cliente, devolvendo um novo token para a nova sessao. */
export const POST = handleApi(async (request) => {
  const ctx = await requireClientContext(request);
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError(request, 400, "INVALID_BODY", "Informe o tenantId.");
  }

  const result = await switchClientTenant(ctx, parsed.data.tenantId);
  return apiJson(request, {
    token: result.token,
    expiresAt: result.expiresAt.toISOString(),
    client: result.client,
    tenant: result.tenant,
    tenants: result.tenants,
  });
});

export const OPTIONS = apiPreflight;
