import { and, eq } from "drizzle-orm";
import { memberships, tenants } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

const EDIT_ROLES = ["owner", "admin"];

export default async function SettingsPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para ver as configurações.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const { cancellationWindowHours, noShowFeePercent, role } = await withUser(
    userId,
    async (tx) => {
      const [policy] = await tx
        .select({
          cancellationWindowHours: tenants.cancellationWindowHours,
          noShowFeePercent: tenants.noShowFeePercent,
        })
        .from(tenants)
        .where(eq(tenants.id, tenant.id))
        .limit(1);

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
        cancellationWindowHours: policy?.cancellationWindowHours ?? 0,
        noShowFeePercent: policy?.noShowFeePercent ?? 0,
        role: membership?.role ?? "",
      };
    },
  );

  const canEdit = EDIT_ROLES.includes(role);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Empresa</p>
        <h1 className="mt-2 text-2xl font-semibold">Configurações</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Políticas de agendamento de {tenant.name}.
        </p>
      </header>

      {canEdit ? (
        <SettingsForm
          cancellationWindowHours={cancellationWindowHours}
          noShowFeePercent={noShowFeePercent}
          canEdit
        />
      ) : (
        <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
          <h2 className="text-lg font-semibold">Sem permissão</h2>
          <p className="mt-2 text-foreground/70">
            Apenas proprietários e administradores podem alterar as
            configurações.
          </p>
        </div>
      )}
    </div>
  );
}
