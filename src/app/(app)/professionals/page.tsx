import { and, asc, eq } from "drizzle-orm";
import {
  branches,
  memberships,
  professionalBranches,
  professionalServices,
  professionals,
  profiles,
  services,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { ProfessionalCard } from "./professional-card";
import { ProfessionalCreateForm } from "./professional-create-form";
import type {
  BranchOption,
  MemberOption,
  Professional,
  ServiceOption,
} from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

export default async function ProfessionalsPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar profissionais.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const { professionalList, branchList, serviceList, memberList, canManage } =
    await withUser(userId, async (tx) => {
      const proRows = await tx
        .select({
          id: professionals.id,
          name: professionals.name,
          commissionBp: professionals.commissionBp,
          isActive: professionals.isActive,
          userId: professionals.userId,
        })
        .from(professionals)
        .where(eq(professionals.tenantId, tenant.id))
        .orderBy(asc(professionals.name));

      const branchRows = await tx
        .select({
          id: branches.id,
          name: branches.name,
          isActive: branches.isActive,
        })
        .from(branches)
        .where(and(eq(branches.tenantId, tenant.id), eq(branches.isActive, true)))
        .orderBy(asc(branches.name));

      const serviceRows = await tx
        .select({
          id: services.id,
          name: services.name,
          isActive: services.isActive,
        })
        .from(services)
        .where(and(eq(services.tenantId, tenant.id), eq(services.isActive, true)))
        .orderBy(asc(services.name));

      const branchLinks = await tx
        .select({
          professionalId: professionalBranches.professionalId,
          branchId: professionalBranches.branchId,
        })
        .from(professionalBranches)
        .where(eq(professionalBranches.tenantId, tenant.id));

      const serviceLinks = await tx
        .select({
          professionalId: professionalServices.professionalId,
          serviceId: professionalServices.serviceId,
        })
        .from(professionalServices)
        .where(eq(professionalServices.tenantId, tenant.id));

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

      const canManage = MANAGE_ROLES.includes(membership?.role ?? "");

      const memberRows = canManage
        ? await tx
            .select({
              userId: memberships.userId,
              fullName: profiles.fullName,
            })
            .from(memberships)
            .leftJoin(profiles, eq(profiles.id, memberships.userId))
            .where(eq(memberships.tenantId, tenant.id))
            .orderBy(asc(profiles.fullName))
        : [];

      const branchMap = new Map<string, string[]>();
      for (const row of branchLinks) {
        const list = branchMap.get(row.professionalId) ?? [];
        list.push(row.branchId);
        branchMap.set(row.professionalId, list);
      }
      const serviceMap = new Map<string, string[]>();
      for (const row of serviceLinks) {
        const list = serviceMap.get(row.professionalId) ?? [];
        list.push(row.serviceId);
        serviceMap.set(row.professionalId, list);
      }

      const list: Professional[] = proRows.map((row) => ({
        id: row.id,
        name: row.name,
        commissionBp: row.commissionBp,
        isActive: row.isActive,
        userId: row.userId,
        branchIds: branchMap.get(row.id) ?? [],
        serviceIds: serviceMap.get(row.id) ?? [],
      }));

      const members: MemberOption[] = memberRows.map((row) => ({
        userId: row.userId,
        name: row.fullName ?? "Usuário sem nome",
      }));

      return {
        professionalList: list,
        branchList: branchRows as BranchOption[],
        serviceList: serviceRows as ServiceOption[],
        memberList: members,
        canManage,
      };
    },
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">
          Organização
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Profissionais</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Quem executa os serviços, em quais filiais e quais serviços realiza.
        </p>
      </header>

      {canManage && <ProfessionalCreateForm />}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Equipe
          </h2>
          <span className="text-xs text-foreground/50">
            {professionalList.length} profissional(is)
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {professionalList.map((professional) => (
            <ProfessionalCard
              key={professional.id}
              professional={professional}
              branches={branchList}
              services={serviceList}
              members={memberList}
              canManage={canManage}
            />
          ))}

          {professionalList.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum profissional cadastrado ainda.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
