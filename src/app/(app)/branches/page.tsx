import { and, asc, eq } from "drizzle-orm";
import { branches, memberships } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { BranchCard } from "./branch-card";
import { BranchCreateForm } from "./branch-create-form";
import type { Branch } from "./types";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = ["owner", "admin", "manager"];

export default async function BranchesPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar filiais.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const { branchList, canManage } = await withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: branches.id,
        name: branches.name,
        slug: branches.slug,
        address: branches.address,
        timezone: branches.timezone,
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
      branchList: rows as Branch[],
      canManage: MANAGER_ROLES.includes(membership?.role ?? ""),
    };
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">
          Organização
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Filiais</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Unidades de {tenant.name}. Preço, agenda e equipe podem variar por
          filial.
        </p>
      </header>

      {canManage && <BranchCreateForm />}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Unidades
          </h2>
          <span className="text-xs text-foreground/50">
            {branchList.length} unidade(s)
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branchList.map((branch) => (
            <BranchCard
              key={branch.id}
              branch={branch}
              canManage={canManage}
            />
          ))}

          {branchList.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhuma filial cadastrada ainda.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
