import { and, asc, eq } from "drizzle-orm";
import {
  clientPackages,
  clients,
  memberships,
  packageItems,
  packageRedemptions,
  packages,
  services,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { PackageForm } from "./package-form";
import { PackageSales } from "./package-sales";
import type {
  ClientOption,
  PackageTemplate,
  ServiceOption,
  SoldPackage,
} from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager", "staff"];

export default async function PackagesPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar pacotes.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const packageRows = await tx
      .select({
        id: packages.id,
        name: packages.name,
        description: packages.description,
        priceCents: packages.priceCents,
        validityDays: packages.validityDays,
        isActive: packages.isActive,
      })
      .from(packages)
      .where(eq(packages.tenantId, tenant.id))
      .orderBy(asc(packages.name));

    const itemRows = await tx
      .select({
        packageId: packageItems.packageId,
        serviceId: packageItems.serviceId,
        quantity: packageItems.quantity,
      })
      .from(packageItems)
      .where(eq(packageItems.tenantId, tenant.id));

    const serviceRows = await tx
      .select({
        id: services.id,
        name: services.name,
        priceCents: services.priceCents,
      })
      .from(services)
      .where(eq(services.tenantId, tenant.id))
      .orderBy(asc(services.name));

    const clientRows = await tx
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(eq(clients.tenantId, tenant.id), eq(clients.isActive, true)))
      .orderBy(asc(clients.name));

    const soldRows = await tx
      .select({
        id: clientPackages.id,
        clientId: clientPackages.clientId,
        packageId: clientPackages.packageId,
        status: clientPackages.status,
        expiresAt: clientPackages.expiresAt,
      })
      .from(clientPackages)
      .where(eq(clientPackages.tenantId, tenant.id));

    const redemptionRows = await tx
      .select({
        clientPackageId: packageRedemptions.clientPackageId,
        serviceId: packageRedemptions.serviceId,
      })
      .from(packageRedemptions)
      .where(eq(packageRedemptions.tenantId, tenant.id));

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
      packageRows,
      itemRows,
      serviceRows,
      clientRows,
      soldRows,
      redemptionRows,
      canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
    };
  });

  const serviceName = new Map(data.serviceRows.map((row) => [row.id, row.name]));
  const clientName = new Map(data.clientRows.map((row) => [row.id, row.name]));

  const itemsByPackage = new Map<
    string,
    { serviceId: string; serviceName: string; quantity: number }[]
  >();
  for (const item of data.itemRows) {
    const list = itemsByPackage.get(item.packageId) ?? [];
    list.push({
      serviceId: item.serviceId,
      serviceName: serviceName.get(item.serviceId) ?? "Serviço",
      quantity: item.quantity,
    });
    itemsByPackage.set(item.packageId, list);
  }

  const templates: PackageTemplate[] = data.packageRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    priceCents: row.priceCents,
    validityDays: row.validityDays ?? null,
    isActive: row.isActive,
    items: (itemsByPackage.get(row.id) ?? []).map((item) => ({
      ...item,
      redeemed: 0,
    })),
  }));

  const templateById = new Map(templates.map((tpl) => [tpl.id, tpl]));
  const redemptionCount = new Map<string, number>();
  for (const row of data.redemptionRows) {
    const key = `${row.clientPackageId}:${row.serviceId}`;
    redemptionCount.set(key, (redemptionCount.get(key) ?? 0) + 1);
  }

  const sold: SoldPackage[] = data.soldRows.map((row) => {
    const template = templateById.get(row.packageId);
    return {
      id: row.id,
      clientName: clientName.get(row.clientId) ?? "Cliente",
      packageName: template?.name ?? "Pacote",
      status: row.status,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      items: (template?.items ?? []).map((item) => ({
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        quantity: item.quantity,
        redeemed: redemptionCount.get(`${row.id}:${item.serviceId}`) ?? 0,
      })),
    };
  });

  const serviceOptions: ServiceOption[] = data.serviceRows;
  const clientOptions: ClientOption[] = data.clientRows;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Comercial</p>
        <h1 className="mt-2 text-2xl font-semibold">Pacotes</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Pré-pago de serviços de {tenant.name}: venda, validade e resgate.
        </p>
      </header>

      <PackageForm
        packages={templates}
        services={serviceOptions}
        canManage={data.canManage}
      />

      <PackageSales
        packages={templates}
        clients={clientOptions}
        sold={sold}
        canManage={data.canManage}
      />
    </div>
  );
}
