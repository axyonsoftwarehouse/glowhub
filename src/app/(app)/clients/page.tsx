import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { clients, memberships, walletTransactions } from "@/db/schema";
import { Pagination } from "@/components/pagination";
import { SearchForm } from "@/components/search-form";
import { withUser } from "@/lib/db";
import {
  PAGE_SIZE,
  pageCount as getPageCount,
  pageOffset,
  parsePage,
} from "@/lib/pagination";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { ClientCard } from "./client-card";
import { ClientCreateForm } from "./client-create-form";
import { WalletList } from "./wallet-list";
import type { Client } from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager", "staff"];

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
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

  const q = first(sp.q)?.trim() || undefined;
  const page = parsePage(first(sp.page));

  const { clientList, total, walletClients, canManage } = await withUser(
    userId,
    async (tx) => {
      const where = q
        ? and(
            eq(clients.tenantId, tenant.id),
            or(
              ilike(clients.name, `%${q}%`),
              ilike(clients.email, `%${q}%`),
              ilike(clients.phone, `%${q}%`),
            ),
          )
        : eq(clients.tenantId, tenant.id);

      const [totals] = await tx
        .select({ value: count() })
        .from(clients)
        .where(where);

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
        .where(where)
        .orderBy(asc(clients.name))
        .limit(PAGE_SIZE)
        .offset(pageOffset(page));

      const walletRows = await tx
        .select({
          clientId: walletTransactions.clientId,
          amountCents: walletTransactions.amountCents,
        })
        .from(walletTransactions)
        .where(eq(walletTransactions.tenantId, tenant.id));

      const allClientRows = await tx
        .select({ id: clients.id, name: clients.name })
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

      const balanceByClient = new Map<string, number>();
      for (const row of walletRows) {
        balanceByClient.set(
          row.clientId,
          (balanceByClient.get(row.clientId) ?? 0) + row.amountCents,
        );
      }

      return {
        clientList: rows as Client[],
        total: Number(totals?.value ?? 0),
        walletClients: allClientRows
          .map((client) => ({
            id: client.id,
            name: client.name,
            balanceCents: balanceByClient.get(client.id) ?? 0,
          }))
          .filter((client) => client.balanceCents !== 0),
        canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
      };
    },
  );

  const totalPages = getPageCount(total);
  const makeHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (targetPage > 1) params.set("page", String(targetPage));
    const query = params.toString();
    return query ? `/clients?${query}` : "/clients";
  };

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Clientes
          </h2>
          <span className="text-xs text-foreground/50">
            {total} cliente(s)
          </span>
        </div>

        <div className="mt-4">
          <SearchForm
            action="/clients"
            defaultValue={q}
            placeholder="Buscar por nome, e-mail ou telefone"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clientList.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}

          {clientList.length === 0 && (
            <p className="text-sm text-foreground/60">
              {q
                ? `Nenhum cliente encontrado para "${q}".`
                : "Nenhum cliente cadastrado ainda."}
            </p>
          )}
        </div>

        <Pagination
          page={page}
          pageCount={totalPages}
          makeHref={makeHref}
        />
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Carteira (crédito pré-pago)
        </h2>
        <div className="mt-4">
          <WalletList clients={walletClients} canManage={canManage} />
        </div>
      </section>
    </div>
  );
}
