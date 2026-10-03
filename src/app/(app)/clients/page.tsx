import { and, asc, eq } from "drizzle-orm";
import { clients, memberships } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { ClientCard } from "./client-card";
import { ClientCreateForm } from "./client-create-form";
import type { Client } from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager", "staff"];

export default async function ClientsPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar clientes.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const { clientList, canManage } = await withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        phone: clients.phone,
        notes: clients.notes,
        isActive: clients.isActive,
      })
      .from(clients)
      .where(eq(clients.tenantId, tenant.id))
      .orderBy(asc(clients.name));

    const [membership] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenant.id),
          eq(memberships.userId, userId),
        ),
      )
      .limit(1);

    return {
      clientList: rows as Client[],
      canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
    };
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Cadastros</p>
        <h1 className="mt-2 text-2xl font-semibold">Clientes</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Histórico de quem consome os serviços e produtos de {tenant.name}.
        </p>
      </header>

      {canManage && <ClientCreateForm />}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Carteira
          </h2>
          <span className="text-xs text-foreground/50">
            {clientList.length} cliente(s)
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clientList.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}

          {clientList.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum cliente cadastrado ainda.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
