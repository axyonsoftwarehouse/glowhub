import { and, desc, eq } from "drizzle-orm";
import { accountingPeriods, memberships } from "@/db/schema";
import {
  summarizeTrialBalance,
  type TrialBalanceRow,
} from "@/lib/accounting";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { ClosingManager } from "./closing-manager";
import type { ClosingPeriod } from "./types";

export const dynamic = "force-dynamic";

const CLOSE_ROLES = ["owner", "admin"];

export default async function ClosingPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para ver o fechamento contábil.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const { periodRows, canManage } = await withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: accountingPeriods.id,
        periodStart: accountingPeriods.periodStart,
        periodEnd: accountingPeriods.periodEnd,
        status: accountingPeriods.status,
        closedAt: accountingPeriods.closedAt,
        snapshot: accountingPeriods.snapshot,
      })
      .from(accountingPeriods)
      .where(eq(accountingPeriods.tenantId, tenant.id))
      .orderBy(desc(accountingPeriods.periodStart));

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
      periodRows: rows,
      canManage: CLOSE_ROLES.includes(membership?.role ?? ""),
    };
  });

  const periods: ClosingPeriod[] = periodRows.map((row) => {
    const snapshot = row.snapshot as TrialBalanceRow[] | null;
    return {
      id: row.id,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      status: row.status,
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      summary: snapshot ? summarizeTrialBalance(snapshot) : null,
    };
  });

  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const defaultStart = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}-01`;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Financeiro</p>
        <h1 className="mt-2 text-2xl font-semibold">Fechamento contábil</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Trava períodos e guarda o balancete do fechamento de {tenant.name}.
        </p>
      </header>

      <ClosingManager
        periods={periods}
        defaultStart={defaultStart}
        defaultEnd={defaultEnd}
        canManage={canManage}
      />
    </div>
  );
}
