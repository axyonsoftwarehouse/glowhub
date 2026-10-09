import { and, asc, count, eq, max, min, notInArray, sum } from "drizzle-orm";
import {
  appointments,
  charges,
  clients as clientsTable,
  memberships,
  payments,
  walletTransactions,
} from "@/db/schema";
import { Pagination } from "@/components/pagination";
import { SearchForm } from "@/components/search-form";
import { withUser } from "@/lib/db";
import {
  averageTicketCents,
  classifyClient,
  daysBetween,
  frequencyDays,
  isVip,
  vipThresholdCents,
} from "@/lib/crm";
import { PAGE_SIZE, pageCount as getPageCount, parsePage } from "@/lib/pagination";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { ClientCard } from "./client-card";
import { ClientCreateForm } from "./client-create-form";
import { WalletList } from "./wallet-list";
import type {
  Client,
  ClientInsights,
  ClientSegmentFilter,
  ClientWithInsights,
} from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager", "staff"];

const TABS: { key: ClientSegmentFilter; label: string }[] = [
  { key: "todas", label: "Todos" },
  { key: "novo", label: "Novos" },
  { key: "ativo", label: "Ativos" },
  { key: "em_risco", label: "Em risco" },
  { key: "inativo", label: "Inativos" },
  { key: "sem_visitas", label: "Sem visitas" },
  { key: "vip", label: "VIP" },
  { key: "aniversariantes", label: "Aniversariantes" },
];

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesQuery(client: Client, query: string): boolean {
  const q = normalize(query);
  return (
    normalize(client.name).includes(q) ||
    normalize(client.email ?? "").includes(q) ||
    normalize(client.phone ?? "").includes(q)
  );
}

function birthdayMonth(birthday: string | null): number | null {
  if (!birthday) return null;
  const month = Number(birthday.slice(5, 7));
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

function filterBySegment(
  client: ClientWithInsights,
  segment: ClientSegmentFilter,
  currentMonth: number,
): boolean {
  switch (segment) {
    case "todas":
      return true;
    case "vip":
      return client.insights.isVip;
    case "aniversariantes":
      return birthdayMonth(client.birthday) === currentMonth;
    default:
      return client.insights.segment === segment;
  }
}

type ClientAggregates = {
  visits: number;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
  totalSpentCents: number;
};

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
  const rawSegment = first(sp.segment);
  const segment: ClientSegmentFilter = TABS.some((tab) => tab.key === rawSegment)
    ? (rawSegment as ClientSegmentFilter)
    : "todas";
  const tag = first(sp.tag)?.trim() || undefined;
  const page = parsePage(first(sp.page));

  const { clientRows, visitRows, spendRows, walletClients, canManage } =
    await withUser(userId, async (tx) => {
      const clients = await tx
        .select({
          id: clientsTable.id,
          name: clientsTable.name,
          email: clientsTable.email,
          phone: clientsTable.phone,
          birthday: clientsTable.birthday,
          tags: clientsTable.tags,
          preferences: clientsTable.preferences,
          marketingOptIn: clientsTable.marketingOptIn,
          notes: clientsTable.notes,
          isActive: clientsTable.isActive,
        })
        .from(clientsTable)
        .where(eq(clientsTable.tenantId, tenant.id))
        .orderBy(asc(clientsTable.name));

      const visits = await tx
        .select({
          clientId: appointments.clientId,
          visits: count(),
          firstVisitAt: min(appointments.startsAt),
          lastVisitAt: max(appointments.startsAt),
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.tenantId, tenant.id),
            notInArray(appointments.status, ["cancelled", "no_show"]),
          ),
        )
        .groupBy(appointments.clientId);

      const spend = await tx
        .select({
          clientId: charges.clientId,
          total: sum(payments.amountCents),
        })
        .from(payments)
        .innerJoin(charges, eq(charges.id, payments.chargeId))
        .where(
          and(
            eq(payments.tenantId, tenant.id),
            eq(payments.status, "confirmed"),
          ),
        )
        .groupBy(charges.clientId);

      const walletRows = await tx
        .select({
          clientId: walletTransactions.clientId,
          amountCents: walletTransactions.amountCents,
        })
        .from(walletTransactions)
        .where(eq(walletTransactions.tenantId, tenant.id));

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
        clientRows: clients,
        visitRows: visits,
        spendRows: spend,
        walletClients: clients
          .map((client) => ({
            id: client.id,
            name: client.name,
            balanceCents: balanceByClient.get(client.id) ?? 0,
          }))
          .filter((client) => client.balanceCents !== 0),
        canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
      };
    });

  const aggregates = new Map<string, ClientAggregates>();
  for (const row of clientRows) {
    aggregates.set(row.id, {
      visits: 0,
      firstVisitAt: null,
      lastVisitAt: null,
      totalSpentCents: 0,
    });
  }
  for (const row of visitRows) {
    const bucket = aggregates.get(row.clientId);
    if (!bucket) continue;
    bucket.visits = Number(row.visits);
    bucket.firstVisitAt = row.firstVisitAt ?? null;
    bucket.lastVisitAt = row.lastVisitAt ?? null;
  }
  for (const row of spendRows) {
    if (!row.clientId) continue;
    const bucket = aggregates.get(row.clientId);
    if (!bucket) continue;
    bucket.totalSpentCents = Number(row.total ?? 0);
  }

  const now = new Date();
  const vipThreshold = vipThresholdCents(
    clientRows.map((row) => aggregates.get(row.id)?.totalSpentCents ?? 0),
  );

  const allClients: ClientWithInsights[] = clientRows.map((row) => {
    const metrics = aggregates.get(row.id) ?? {
      visits: 0,
      firstVisitAt: null,
      lastVisitAt: null,
      totalSpentCents: 0,
    };
    const visits = metrics.visits;
    const daysSinceLastVisit = metrics.lastVisitAt
      ? Math.max(0, daysBetween(metrics.lastVisitAt, now))
      : null;
    const insights: ClientInsights = {
      segment: classifyClient(metrics, now),
      isVip: isVip(metrics.totalSpentCents, vipThreshold),
      visits,
      totalSpentCents: metrics.totalSpentCents,
      averageTicketCents: averageTicketCents(metrics.totalSpentCents, visits),
      daysSinceLastVisit,
      frequencyDays: frequencyDays(metrics),
    };
    return { ...row, insights };
  });

  const searched = q
    ? allClients.filter((client) => matchesQuery(client, q))
    : allClients;

  const currentMonth = now.getMonth() + 1;
  const counts = new Map<ClientSegmentFilter, number>();
  for (const tab of TABS) {
    counts.set(
      tab.key,
      searched.filter((client) =>
        filterBySegment(client, tab.key, currentMonth),
      ).length,
    );
  }

  let filtered = searched.filter((client) =>
    filterBySegment(client, segment, currentMonth),
  );
  if (tag) {
    const needle = tag.toLowerCase();
    filtered = filtered.filter((client) =>
      (client.tags ?? []).some((value) => value.toLowerCase() === needle),
    );
  }

  const total = filtered.length;
  const totalPages = getPageCount(total);
  const pageItems = filtered.slice(
    (page - 1) * PAGE_SIZE,
    (page - 1) * PAGE_SIZE + PAGE_SIZE,
  );

  const tagCounts = new Map<string, number>();
  for (const client of searched) {
    for (const value of client.tags ?? []) {
      tagCounts.set(value, (tagCounts.get(value) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const makeHref = (
    overrides: Partial<{ page: number; segment: ClientSegmentFilter; tag: string }>,
  ) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const nextSegment = overrides.segment ?? segment;
    if (nextSegment !== "todas") params.set("segment", nextSegment);
    const nextTag = overrides.tag ?? tag;
    if (nextTag) params.set("tag", nextTag);
    const nextPage = overrides.page ?? 1;
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return query ? `/clients?${query}` : "/clients";
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Cadastros</p>
        <h1 className="mt-2 text-2xl font-semibold">Clientes</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Histórico, preferências e inteligência de quem consome os serviços e
          produtos de {tenant.name}.
        </p>
      </header>

      {canManage && <ClientCreateForm />}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Clientes
          </h2>
          <span className="text-xs text-foreground/70">{total} cliente(s)</span>
        </div>

        <div className="mt-4">
          <SearchForm
            action="/clients"
            defaultValue={q}
            placeholder="Buscar por nome, e-mail ou telefone"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const active = tab.key === segment;
            return (
              <a
                key={tab.key}
                href={makeHref({ segment: tab.key, page: 1 })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  active
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {tab.label}
                <span className="ml-1 opacity-70">{counts.get(tab.key) ?? 0}</span>
              </a>
            );
          })}
        </div>

        {topTags.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-foreground/50">
              Tags
            </span>
            {tag && (
              <a
                href={makeHref({ tag: "", page: 1 })}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
              >
                limpar ×
              </a>
            )}
            {topTags.map(([value, tagTotal]) => {
              const active = value.toLowerCase() === tag?.toLowerCase();
              return (
                <a
                  key={value}
                  href={makeHref({ tag: value, page: 1 })}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    active
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {value} · {tagTotal}
                </a>
              );
            })}
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}

          {pageItems.length === 0 && (
            <p className="text-sm text-foreground/60">
              {q
                ? `Nenhum cliente encontrado para "${q}".`
                : "Nenhum cliente neste filtro."}
            </p>
          )}
        </div>

        <Pagination
          page={page}
          pageCount={totalPages}
          makeHref={(target) => makeHref({ page: target })}
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
