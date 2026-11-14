import { isAssistantConfigured } from "@/lib/assistant";
import { getCurrentTenant } from "@/lib/tenant";
import { AssistantTabs } from "./assistant-tabs";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const tenant = await getCurrentTenant();
  const configured = isAssistantConfigured();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Assistente</p>
        <h1 className="mt-2 text-2xl font-semibold">Assistente do seu negócio</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Pergunte, escreva textos e analise a agenda, clientes e finanças
          {tenant ? ` de ${tenant.name}` : ""}. O assistente consulta e sugere;
          nenhuma alteração é feita sem você confirmar.
        </p>
      </header>

      {!tenant && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Nenhuma empresa identificada. Entre novamente ou conclua o onboarding.
        </div>
      )}

      {tenant && !configured && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          O assistente ainda não está configurado. Peça ao administrador para
          definir <code className="font-mono">OPENROUTER_API_KEY</code> no
          ambiente.
        </div>
      )}

      <AssistantTabs
        tenantName={tenant?.name ?? "sua empresa"}
        disabled={!tenant || !configured}
      />
    </div>
  );
}
