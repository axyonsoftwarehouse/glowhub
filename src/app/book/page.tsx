import { and, asc, eq } from "drizzle-orm";
import {
  branches,
  professionalBranches,
  professionalServices,
  professionals,
  services,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { BookingWizard } from "./booking-wizard";
import type {
  BookingBranch,
  BookingProfessional,
  BookingService,
} from "./types";

export const dynamic = "force-dynamic";

export default async function PublicBookingPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16 text-center"
      >
        <h1 className="text-2xl font-semibold">Agendamento</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Nenhuma empresa foi identificada. Acesse pelo endereço da sua empresa.
        </p>
      </main>
    );
  }

  const db = getDb();

  const serviceRows = await db
    .select({
      id: services.id,
      name: services.name,
      durationMinutes: services.durationMinutes,
      priceCents: services.priceCents,
    })
    .from(services)
    .where(and(eq(services.tenantId, tenant.id), eq(services.isActive, true)))
    .orderBy(asc(services.name));

  const branchRows = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(and(eq(branches.tenantId, tenant.id), eq(branches.isActive, true)))
    .orderBy(asc(branches.name));

  const professionalRows = await db
    .select({ id: professionals.id, name: professionals.name })
    .from(professionals)
    .where(
      and(eq(professionals.tenantId, tenant.id), eq(professionals.isActive, true)),
    )
    .orderBy(asc(professionals.name));

  const proBranchRows = await db
    .select({
      professionalId: professionalBranches.professionalId,
      branchId: professionalBranches.branchId,
    })
    .from(professionalBranches)
    .where(eq(professionalBranches.tenantId, tenant.id));

  const proServiceRows = await db
    .select({
      professionalId: professionalServices.professionalId,
      serviceId: professionalServices.serviceId,
    })
    .from(professionalServices)
    .where(eq(professionalServices.tenantId, tenant.id));

  const proBranchMap = new Map<string, string[]>();
  for (const row of proBranchRows) {
    const list = proBranchMap.get(row.professionalId) ?? [];
    list.push(row.branchId);
    proBranchMap.set(row.professionalId, list);
  }
  const proServiceMap = new Map<string, string[]>();
  for (const row of proServiceRows) {
    const list = proServiceMap.get(row.professionalId) ?? [];
    list.push(row.serviceId);
    proServiceMap.set(row.professionalId, list);
  }

  const professionalList: BookingProfessional[] = professionalRows.map((row) => ({
    id: row.id,
    name: row.name,
    branchIds: proBranchMap.get(row.id) ?? [],
    serviceIds: proServiceMap.get(row.id) ?? [],
  }));

  return (
    <main
      id="conteudo"
      className="mx-auto w-full max-w-2xl flex-1 px-6 py-12"
    >
      <header className="text-center">
        <p className="text-xs uppercase tracking-widest text-brand">
          Agendamento online
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{tenant.name}</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Escolha o serviço, o profissional e o horário.
        </p>
      </header>

      {serviceRows.length === 0 || branchRows.length === 0 ? (
        <p className="mt-10 text-center text-sm text-foreground/60">
          Agendamento online indisponível no momento.
        </p>
      ) : (
        <BookingWizard
          services={serviceRows as BookingService[]}
          branches={branchRows as BookingBranch[]}
          professionals={professionalList}
        />
      )}
    </main>
  );
}
