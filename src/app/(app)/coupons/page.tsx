import { and, desc, eq } from "drizzle-orm";
import { coupons, memberships } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { CouponForm } from "./coupon-form";
import type { Coupon } from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

export default async function CouponsPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar cupons.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: coupons.id,
        code: coupons.code,
        description: coupons.description,
        discountType: coupons.discountType,
        discountValue: coupons.discountValue,
        minAmountCents: coupons.minAmountCents,
        maxUses: coupons.maxUses,
        usedCount: coupons.usedCount,
        isActive: coupons.isActive,
      })
      .from(coupons)
      .where(eq(coupons.tenantId, tenant.id))
      .orderBy(desc(coupons.createdAt));

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
      coupons: rows as Coupon[],
      canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
    };
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Comercial</p>
        <h1 className="mt-2 text-2xl font-semibold">Cupons</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Descontos de {tenant.name} aplicáveis a cobranças abertas.
        </p>
      </header>

      <CouponForm coupons={data.coupons} canManage={data.canManage} />
    </div>
  );
}
