"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAppEnv } from "@/lib/app-env";
import { isPlanId } from "@/lib/billing/plans";
import { applyBillingEvent, cancelSubscription, startCheckout } from "@/lib/billing/service";
import { getSession } from "@/lib/session";
import { getCurrentTenant, getUserTenants } from "@/lib/tenant";

export type BillingActionState = { status: "idle" | "error" | "success"; message?: string };

async function managerContext() {
  const [session, tenant, tenants] = await Promise.all([
    getSession(),
    getCurrentTenant(),
    getUserTenants(),
  ]);
  if (!session?.user) return { error: "Sessão expirada." as const };
  if (!tenant) return { error: "Empresa não resolvida." as const };
  const role = tenants.find((t) => t.id === tenant.id)?.role;
  if (role !== "owner" && role !== "admin") {
    return { error: "Só o proprietário ou um administrador pode alterar o plano." as const };
  }
  return { tenant, email: session.user.email };
}

export async function checkoutAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const plan = formData.get("plan");
  if (!isPlanId(plan)) return { status: "error", message: "Plano inválido." };
  const ctx = await managerContext();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const result = await startCheckout({ tenant: ctx.tenant, plan, payerEmail: ctx.email });
  if (!result.ok) return { status: "error", message: result.message };
  redirect(result.url);
}

export async function cancelAction(): Promise<BillingActionState> {
  const ctx = await managerContext();
  if ("error" in ctx) return { status: "error", message: ctx.error };
  const result = await cancelSubscription(ctx.tenant);
  revalidatePath("/billing");
  return { status: result.ok ? "success" : "error", message: result.message };
}

/**
 * Simula a resposta do provedor mock: so em APP_ENV=dev (local, e2e, preview).
 * Na demo e em producao o checkout simulado nao confirma nada.
 */
export async function simulateMockPaymentAction(formData: FormData): Promise<void> {
  if (getAppEnv() !== "dev") redirect("/billing?erro=mock");
  const sub = String(formData.get("sub") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const decision = formData.get("decision") === "rejected" ? "rejected" : "approved";
  if (!sub.startsWith("mock_sub_")) redirect("/billing?erro=mock");

  await applyBillingEvent("mock", {
    kind: "payment",
    providerSubscriptionId: sub,
    providerPaymentId: `mock_pay_${crypto.randomUUID()}`,
    status: decision,
    amountCents: Number.isFinite(amount) ? amount : 0,
    paidAt: new Date(),
  });
  redirect(decision === "approved" ? "/billing?pago=1" : "/billing?recusado=1");
}
