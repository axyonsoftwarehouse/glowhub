import { apiJson, apiPreflight, handleApi } from "@/lib/api";
import { listClientTenants, requireClientContext } from "@/lib/client-auth";

export const dynamic = "force-dynamic";

/** Cliente logado, empresa ativa e empresas em que o e-mail tem cadastro. */
export const GET = handleApi(async (request) => {
  const ctx = await requireClientContext(request);
  return apiJson(request, {
    client: ctx.client,
    tenant: ctx.tenant,
    tenants: await listClientTenants(ctx.email),
  });
});

export const OPTIONS = apiPreflight;
