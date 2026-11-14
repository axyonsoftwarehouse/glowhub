import { isAssistantConfigured } from "@/lib/assistant";
import { getCurrentTenant } from "@/lib/tenant";
import { AssistantChat } from "./assistant-chat";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const tenant = await getCurrentTenant();
  const configured = isAssistantConfigured();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Assistente</p>
        <h1 className="mt-2 text-2xl font-semibold">Pergunte sobre o seu negócio</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Consulta a agenda, clientes, serviços e finanças
          {tenant ? ` de ${tenant.name}` : ""}. O assistente só lê os dados:
          nenhuma alteração é feita por aqui.
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

      <AssistantChat
        tenantName={tenant?.name ?? "sua empresa"}
        disabled={!tenant || !configured}
      />
    </div>
  );
}
