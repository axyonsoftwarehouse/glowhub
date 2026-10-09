import { and, asc, count, eq, ilike, inArray, isNull } from "drizzle-orm";
import {
  branches,
  categories,
  memberships,
  productVariants,
  products,
  serviceBranches,
  serviceMaterials,
  services,
} from "@/db/schema";
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
import { CategoryManager } from "./category-manager";
import { ServiceCard } from "./service-card";
import { ServiceCreateForm } from "./service-create-form";
import type {
  BranchOption,
  Category,
  InsumoOption,
  Service,
  ServiceBranchOverride,
  ServiceMaterial,
} from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function ServicesPage({
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
          Selecione ou configure um tenant para gerenciar o catálogo.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const q = first(sp.q)?.trim() || undefined;
  const page = parsePage(first(sp.page));

  const { categories: categoryList, services: serviceList, branches: branchList, overridesByService, materialsByService, insumos, total, canManage } =
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

      const serviceWhere = q
        ? and(
            eq(services.tenantId, tenant.id),
            ilike(services.name, `%${q}%`),
          )
        : eq(services.tenantId, tenant.id);

      const [serviceTotals] = await tx
        .select({ value: count() })
        .from(services)
        .where(serviceWhere);

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
        .where(serviceWhere)
        .orderBy(asc(services.name))
        .limit(PAGE_SIZE)
        .offset(pageOffset(page));

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

      const serviceIds = serviceRows.map((row) => row.id);

      const materialRows = serviceIds.length
        ? await tx
            .select({
              id: serviceMaterials.id,
              serviceId: serviceMaterials.serviceId,
              variantId: serviceMaterials.variantId,
              quantity: serviceMaterials.quantity,
            })
            .from(serviceMaterials)
            .where(
              and(
                eq(serviceMaterials.tenantId, tenant.id),
                inArray(serviceMaterials.serviceId, serviceIds),
              ),
            )
        : [];

      const insumoRows = await tx
        .select({
          variantId: productVariants.id,
          productName: products.name,
          variantName: productVariants.name,
          unit: productVariants.unit,
          costCents: productVariants.costCents,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(
          and(
            eq(productVariants.tenantId, tenant.id),
            eq(products.kind, "internal"),
            eq(productVariants.isActive, true),
          ),
        )
        .orderBy(asc(products.name), asc(productVariants.name));

      const materialVariantIds = [...new Set(materialRows.map((row) => row.variantId))];
      const materialLabels = materialVariantIds.length
        ? await tx
            .select({
              variantId: productVariants.id,
              productName: products.name,
              variantName: productVariants.name,
              unit: productVariants.unit,
            })
            .from(productVariants)
            .innerJoin(products, eq(products.id, productVariants.productId))
            .where(
              and(
                eq(productVariants.tenantId, tenant.id),
                inArray(productVariants.id, materialVariantIds),
              ),
            )
        : [];

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

      const labelByVariant = new Map(
        materialLabels.map((row) => [
          row.variantId,
          { label: `${row.productName} · ${row.variantName}`, unit: row.unit },
        ]),
      );
      const materialsByService = new Map<string, ServiceMaterial[]>();
      for (const row of materialRows) {
        const info = labelByVariant.get(row.variantId);
        const list = materialsByService.get(row.serviceId) ?? [];
        list.push({
          id: row.id,
          variantId: row.variantId,
          label: info?.label ?? "Insumo",
          unit: info?.unit ?? "un",
          quantity: row.quantity,
        });
        materialsByService.set(row.serviceId, list);
      }

      const insumos: InsumoOption[] = insumoRows.map((row) => ({
        variantId: row.variantId,
        label: `${row.productName} · ${row.variantName}`,
        unit: row.unit,
        costCents: row.costCents,
      }));

      return {
        categories: categoryRows as Category[],
        services: serviceRows as Service[],
        branches: branchRows as BranchOption[],
        overridesByService: grouped,
        materialsByService,
        insumos,
        total: Number(serviceTotals?.value ?? 0),
        canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
      };
    });

  const totalPages = getPageCount(total);
  const makeHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (targetPage > 1) params.set("page", String(targetPage));
    const query = params.toString();
    return query ? `/services?${query}` : "/services";
  };

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
          <span className="text-xs text-foreground/70">
            {total} serviço(s)
          </span>
        </div>

        <div className="mt-4">
          <SearchForm
            action="/services"
            defaultValue={q}
            placeholder="Buscar por nome do serviço"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {serviceList.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              categories={categoryList}
              branches={branchList}
              overrides={overridesByService.get(service.id) ?? []}
              materials={materialsByService.get(service.id) ?? []}
              insumos={insumos}
              canManage={canManage}
            />
          ))}

          {serviceList.length === 0 && (
            <p className="text-sm text-foreground/60">
              {q
                ? `Nenhum serviço encontrado para "${q}".`
                : "Nenhum serviço cadastrado ainda."}
            </p>
          )}
        </div>

        <Pagination page={page} pageCount={totalPages} makeHref={makeHref} />
      </section>
    </div>
  );
}
