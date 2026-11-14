import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";

/**
 * Modo enxuto: tenants solo não usam as áreas avançadas de financeiro/empresa.
 * Quem quiser o modo completo desativa o modo solo em Configurações.
 */
export async function requireFullMode(): Promise<void> {
  const tenant = await getCurrentTenant();
  if (tenant?.isSolo) redirect("/dashboard");
}
