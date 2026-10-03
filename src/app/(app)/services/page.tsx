import { and, asc, eq, isNull } from "drizzle-orm";
import {
  branches,
  categories,
  memberships,
  serviceBranches,
  services,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { CategoryManager } from "./category-manager";
import { ServiceCard } from "./service-card";
import { ServiceCreateForm } from "./service-create-form";
import type {
  BranchOption,
  Category,
  Service,
  ServiceBranchOverride,
} from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

export default async function ServicesPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar o catálogo.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const { categories: categoryList, services: serviceList, branches: branchList, overridesByService, canManage } =
    await withUser(userId, async (tx) => {
      const categoryRows = await tx
        .select({
          id: categories.id,
          name: categories.name,
          sortOrder: categories.sortOrder,
          isActive: categories.isActive,
        })
        .from(categories)
        .where(
          and(
            eq(categories.tenantId, tenant.id),
            eq(categories.kind, "service"),
            isNull(categories.parentId),
          ),
        )
        .orderBy(asc(categories.sortOrder), asc(categories.name));

      const serviceRows = await tx
        .select({
          id: services.id,
          name: services.name,
          description: services.description,
          durationMinutes: services.durationMinutes,
          priceCents: services.priceCents,
          categoryId: services.categoryId,
          imageUrl: services.imageUrl,
          isActive: services.isActive,
        })
        .from(services)
        .where(eq(services.tenantId, tenant.id))
        .orderBy(asc(services.name));

      const branchRows = await tx
        .select({
          id: branches.id,
          name: branches.name,
          isActive: branches.isActive,
        })
        .from(branches)
        .where(and(eq(branches.tenantId, tenant.id), eq(branches.isActive, true)))
        .orderBy(asc(branches.name));

      const overrideRows = await tx
        .select({
          serviceId: serviceBranches.serviceId,
          branchId: serviceBranches.branchId,
          priceCents: serviceBranches.priceCents,
          durationMinutes: serviceBranches.durationMinutes,
          isActive: serviceBranches.isActive,
        })
        .from(serviceBranches)
        .where(eq(serviceBranches.tenantId, tenant.id));

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

      const grouped = new Map<string, ServiceBranchOverride[]>();
      for (const row of overrideRows) {
        const list = grouped.get(row.serviceId) ?? [];
        list.push({
          branchId: row.branchId,
          priceCents: row.priceCents ?? null,
          durationMinutes: row.durationMinutes ?? null,
          isActive: row.isActive,
        });
        grouped.set(row.serviceId, list);
      }

      return {
        categories: categoryRows as Category[],
        services: serviceRows as Service[],
        branches: branchRows as BranchOption[],
        overridesByService: grouped,
        canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
      };
    });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Catálogo</p>
        <h1 className="mt-2 text-2xl font-semibold">Serviços</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Serviços oferecidos por {tenant.name}, com duração e preço padrão.
        </p>
      </header>

      <CategoryManager
        categories={categoryList}
        canManage={canManage}
        kind="service"
      />

      {canManage && <ServiceCreateForm categories={categoryList} />}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Serviços
          </h2>
          <span className="text-xs text-foreground/50">
            {serviceList.length} serviço(s)
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {serviceList.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              categories={categoryList}
              branches={branchList}
              overrides={overridesByService.get(service.id) ?? []}
              canManage={canManage}
            />
          ))}

          {serviceList.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum serviço cadastrado ainda.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
