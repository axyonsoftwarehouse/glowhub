import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { branches, memberships } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant, getUserTenants } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type BranchRow = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  isActive: boolean;
};

export default async function DashboardPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhum tenant resolvido</h1>
        <p className="mt-2 text-foreground/70">
          Defina <code className="font-mono">DEFAULT_TENANT_SLUG</code> (ex.:
          <code className="font-mono">demo</code>) para desenvolvimento, ou acesse
          via subdomínio (<code className="font-mono">demo.SEU_DOMINIO</code>).
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";
  const myTenants = await getUserTenants();

  const { branchList, role } = await withUser(userId, async (tx) => {
    const branchRows = await tx
      .select({
        id: branches.id,
        name: branches.name,
        slug: branches.slug,
        address: branches.address,
        isActive: branches.isActive,
      })
      .from(branches)
      .where(eq(branches.tenantId, tenant.id))
      .orderBy(asc(branches.name));

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
      branchList: branchRows as BranchRow[],
      role: membership?.role ?? null,
    };
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Visão geral</p>
        <h1 className="mt-2 text-2xl font-semibold">{tenant.name}</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Tenant <code className="font-mono">{tenant.slug}</code>
          {role ? (
            <>
              {" · "}seu papel: <span className="font-medium">{role}</span>
            </>
          ) : null}
        </p>
      </header>

      {myTenants.length === 0 && (
        <section className="rounded-2xl border border-brand/40 bg-brand/5 p-6">
          <h2 className="text-base font-semibold">Crie sua empresa</h2>
          <p className="mt-1 text-sm text-foreground/70">
            Você ainda não está vinculado a nenhuma empresa. Crie a sua para
            começar a usar a agenda, o catálogo e o financeiro.
          </p>
          <Link
            href="/onboarding"
            className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
          >
            Criar empresa
          </Link>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Filiais
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-foreground/70">
              {branchList.length} unidade(s)
            </span>
            <Link
              href="/branches"
              className="text-xs font-medium text-brand hover:underline"
            >
              Gerenciar
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branchList.map((branch) => (
            <article
              key={branch.id}
              className="rounded-2xl border border-border bg-white/70 p-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{branch.name}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    branch.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {branch.isActive ? "Ativa" : "Inativa"}
                </span>
              </div>
              <p className="mt-1 text-xs text-foreground/70">/{branch.slug}</p>
              {branch.address && (
                <p className="mt-3 text-sm text-foreground/70">{branch.address}</p>
              )}
            </article>
          ))}

          {branchList.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhuma filial cadastrada ainda.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-border p-6">
        <h2 className="text-sm font-semibold">Próximos passos</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground/70">
          <li>Financeiro contábil (ledger de partidas dobradas).</li>
          <li>Website público / agendamento online.</li>
          <li>App do cliente (mobile).</li>
        </ul>
      </section>
    </div>
  );
}
