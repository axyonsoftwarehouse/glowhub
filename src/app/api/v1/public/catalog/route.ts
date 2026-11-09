import { and, asc, eq, inArray } from "drizzle-orm";
import {
  branches,
  categories,
  professionalBranches,
  professionals,
  professionalServices,
  serviceBranches,
  services,
} from "@/db/schema";
import { apiJson, apiPreflight, handleApi } from "@/lib/api";
import { getDb } from "@/lib/db";
import { resolvePublicTenant } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (request) => {
  const tenant = await resolvePublicTenant(request);
  const db = getDb();

  const [branchRows, categoryRows, serviceRows, professionalRows] =
    await Promise.all([
      db
        .select({
          id: branches.id,
          name: branches.name,
          slug: branches.slug,
          address: branches.address,
          timezone: branches.timezone,
        })
        .from(branches)
        .where(
          and(eq(branches.tenantId, tenant.id), eq(branches.isActive, true)),
        )
        .orderBy(asc(branches.name)),
      db
        .select({
          id: categories.id,
          parentId: categories.parentId,
          name: categories.name,
          sortOrder: categories.sortOrder,
        })
        .from(categories)
        .where(
          and(
            eq(categories.tenantId, tenant.id),
            eq(categories.kind, "service"),
            eq(categories.isActive, true),
          ),
        )
        .orderBy(asc(categories.sortOrder), asc(categories.name)),
      db
        .select({
          id: services.id,
          categoryId: services.categoryId,
          name: services.name,
          description: services.description,
          durationMinutes: services.durationMinutes,
          priceCents: services.priceCents,
          imageUrl: services.imageUrl,
        })
        .from(services)
        .where(
          and(eq(services.tenantId, tenant.id), eq(services.isActive, true)),
        )
        .orderBy(asc(services.name)),
      db
        .select({ id: professionals.id, name: professionals.name })
        .from(professionals)
        .where(
          and(
            eq(professionals.tenantId, tenant.id),
            eq(professionals.isActive, true),
          ),
        )
        .orderBy(asc(professionals.name)),
    ]);

  const serviceIds = serviceRows.map((row) => row.id);
  const professionalIds = professionalRows.map((row) => row.id);
  const activeBranchIds = new Set(branchRows.map((row) => row.id));
  const activeServiceIds = new Set(serviceIds);

  const [overrideRows, proBranchRows, proServiceRows] = await Promise.all([
    serviceIds.length
      ? db
          .select({
            serviceId: serviceBranches.serviceId,
            branchId: serviceBranches.branchId,
            priceCents: serviceBranches.priceCents,
            durationMinutes: serviceBranches.durationMinutes,
            isActive: serviceBranches.isActive,
          })
          .from(serviceBranches)
          .where(
            and(
              eq(serviceBranches.tenantId, tenant.id),
              inArray(serviceBranches.serviceId, serviceIds),
            ),
          )
      : Promise.resolve([]),
    professionalIds.length
      ? db
          .select({
            professionalId: professionalBranches.professionalId,
            branchId: professionalBranches.branchId,
          })
          .from(professionalBranches)
          .where(
            and(
              eq(professionalBranches.tenantId, tenant.id),
              inArray(professionalBranches.professionalId, professionalIds),
            ),
          )
      : Promise.resolve([]),
    professionalIds.length
      ? db
          .select({
            professionalId: professionalServices.professionalId,
            serviceId: professionalServices.serviceId,
          })
          .from(professionalServices)
          .where(
            and(
              eq(professionalServices.tenantId, tenant.id),
              inArray(professionalServices.professionalId, professionalIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  const overridesByService = new Map<
    string,
    { branchId: string; priceCents: number | null; durationMinutes: number | null; isActive: boolean }[]
  >();
  for (const row of overrideRows) {
    if (!activeBranchIds.has(row.branchId)) continue;
    const list = overridesByService.get(row.serviceId) ?? [];
    list.push({
      branchId: row.branchId,
      priceCents: row.priceCents,
      durationMinutes: row.durationMinutes,
      isActive: row.isActive,
    });
    overridesByService.set(row.serviceId, list);
  }

  const branchIdsByProfessional = new Map<string, string[]>();
  for (const row of proBranchRows) {
    if (!activeBranchIds.has(row.branchId)) continue;
    const list = branchIdsByProfessional.get(row.professionalId) ?? [];
    list.push(row.branchId);
    branchIdsByProfessional.set(row.professionalId, list);
  }

  const serviceIdsByProfessional = new Map<string, string[]>();
  for (const row of proServiceRows) {
    const list = serviceIdsByProfessional.get(row.professionalId) ?? [];
    list.push(row.serviceId);
    serviceIdsByProfessional.set(row.professionalId, list);
  }

  return apiJson(request, {
    tenant,
    branches: branchRows,
    categories: categoryRows,
    services: serviceRows.map((row) => ({
      ...row,
      branchOverrides: overridesByService.get(row.id) ?? [],
    })),
    professionals: professionalRows.map((row) => ({
      ...row,
      branchIds: branchIdsByProfessional.get(row.id) ?? [],
      serviceIds: (serviceIdsByProfessional.get(row.id) ?? []).filter((id) =>
        activeServiceIds.has(id),
      ),
    })),
  });
});

export const OPTIONS = apiPreflight;
