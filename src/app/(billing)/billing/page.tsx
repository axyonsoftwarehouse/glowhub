import Link from "next/link";
import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/env";
import { effectiveLimits } from "@/lib/billing/access";
import { PLAN_IDS, PLANS, TRIAL_DAYS, formatPrice, isPlanId, limitLabel, type PlanLimits } from "@/lib/billing/plans";
import { getAccess, getUsage, listPayments } from "@/lib/billing/service";
import { getSession } from "@/lib/session";
import { getCurrentTenant, getUserTenants } from "@/lib/tenant";
import { SetupNotice } from "@/components/setup-notice";
import { SignOutButton } from "@/app/(app)/sign-out-button";
import { TenantSwitcher } from "@/app/(app)/tenant-switcher";
import { CancelButton, PlanButton } from "./plan-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plano e cobrança · GlowHub" };

const STATUS_LABEL: Record<string, string> = {
  trialing: "Teste grátis",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  comp: "Cortesia (demonstração)",
};

const PAYMENT_LABEL: Record<string, string> = {
  approved: "Pago",
  rejected: "Recusado",
  refunded: "Estornado",
};

function formatDate(date: Date | null | undefined): string {
  return date ? date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
}

function limitText(limits: PlanLimits): string[] {
  return (Object.keys(limits) as (keyof PlanLimits)[]).map((key) => {
    const max = limits[key];
    if (max !== null) return `Até ${limitLabel(key, max)}`;
    const plural = limitLabel(key, 2).replace(/^2 /, "");
    return `${plural.charAt(0).toUpperCase()}${plural.slice(1)} ilimitados`;
  });
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string; recusado?: string; retorno?: string; erro?: string }>;
}) {
  if (!isConfigured()) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <SetupNotice />
      </div>
    );
  }

  const session = await getSession();
  if (!session?.user) redirect("/login?next=/billing");
  const [tenant, tenants] = await Promise.all([getCurrentTenant(), getUserTenants()]);
  if (!tenant) redirect("/onboarding");

  const role = tenants.find((t) => t.id === tenant.id)?.role ?? "";
  const canManage = role === "owner" || role === "admin";
  const [{ subscription, access }, usage, payments, query] = await Promise.all([
    getAccess(tenant),
    getUsage(tenant.id),
    listPayments(tenant.id),
    searchParams,
  ]);
  const limits = effectiveLimits(subscription);
  const currentPlan = isPlanId(subscription.plan) ? PLANS[subscription.plan] : null;
  const isPaid = subscription.status === "active" || subscription.status === "past_due";
  const statusLabel =
    isPaid && access.level === "blocked"
      ? "Em atraso"
      : isPaid && access.level === "warning"
        ? "Pagamento pendente"
        : subscription.status === "trialing" && access.level === "blocked"
          ? "Teste encerrado"
          : STATUS_LABEL[subscription.status];
  const heading = currentPlan
    ? `Plano ${currentPlan.name}`
    : subscription.status === "comp"
      ? "Empresa de demonstração"
      : "Nenhum plano contratado";
  const trialOver = subscription.trialEndsAt ? subscription.trialEndsAt <= new Date() : true;

  return (
    <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          Glow<span className="text-brand">Hub</span>
        </Link>
        <div className="flex items-center gap-3">
          {access.level !== "blocked" && (
            <Link href="/dashboard" className="text-sm text-brand hover:underline">
              Voltar ao painel
            </Link>
          )}
          <SignOutButton />
        </div>
      </header>

      {tenants.length > 1 && (
        <div className="mt-4 max-w-xs">
          <TenantSwitcher tenants={tenants} activeTenantId={tenant.id} />
        </div>
      )}

      <h1 className="mt-8 text-2xl font-semibold">Plano e cobrança</h1>
      <p className="mt-1 text-sm text-foreground/60">{tenant.name}</p>

      {query.pago && (
        <p role="status" className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Pagamento confirmado. Obrigado!
        </p>
      )}
      {query.recusado && (
        <p role="alert" className="mt-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          O pagamento foi recusado. Tente outro meio de pagamento.
        </p>
      )}
      {query.retorno && !query.pago && (
        <p role="status" className="mt-6 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          Recebemos seu retorno do pagamento. A confirmação pode levar alguns minutos.
        </p>
      )}

      <section
        aria-label="Situação da assinatura"
        className={`mt-6 rounded-2xl border p-5 ${
          access.level === "blocked"
            ? "border-red-300 bg-red-50"
            : access.level === "warning"
              ? "border-amber-300 bg-amber-50"
              : "border-border bg-white/70"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-lg font-semibold">
            {heading}
          </p>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium">
            {statusLabel}
          </span>
        </div>
        {access.message && <p className="mt-2 text-sm">{access.message}</p>}
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          {subscription.status === "trialing" && (
            <div>
              <dt className="text-foreground/60">
                {trialOver ? "Teste terminou em" : "Teste termina em"}
              </dt>
              <dd>{formatDate(subscription.trialEndsAt)}</dd>
            </div>
          )}
          {isPaid && (
            <div>
              <dt className="text-foreground/60">Próximo vencimento</dt>
              <dd>{formatDate(subscription.currentPeriodEnd)}</dd>
            </div>
          )}
          <div>
            <dt className="text-foreground/60">Uso atual</dt>
            <dd>
              {(Object.keys(usage) as (keyof typeof usage)[])
                .map((key) => `${limitLabel(key, usage[key])}${limits[key] !== null ? ` de ${limits[key]}` : ""}`)
                .join(" · ")}
            </dd>
          </div>
        </dl>
        {subscription.pendingPlan && isPlanId(subscription.pendingPlan) && (
          <p className="mt-3 text-sm text-foreground/70">
            Pagamento do plano {PLANS[subscription.pendingPlan].name} aguardando confirmação.
          </p>
        )}
      </section>

      {subscription.status === "comp" ? (
        <p className="mt-8 text-sm text-foreground/70">
          Esta é uma empresa de demonstração e não precisa de assinatura.
        </p>
      ) : (
        <>
          {!canManage && (
            <p className="mt-8 rounded-xl bg-muted px-4 py-3 text-sm">
              Só o proprietário ou um administrador da empresa pode contratar ou trocar o plano.
            </p>
          )}
          <section aria-label="Planos" className="mt-8 grid gap-4 md:grid-cols-3">
            {PLAN_IDS.map((id) => {
              const plan = PLANS[id];
              const isCurrent = isPaid && subscription.plan === id;
              const needsPayment = isCurrent && access.level !== "ok";
              return (
                <article
                  key={id}
                  className={`flex flex-col rounded-2xl border bg-white/70 p-5 ${
                    isCurrent ? "border-brand ring-1 ring-brand" : "border-border"
                  }`}
                >
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  <p className="text-sm text-foreground/60">{plan.description}</p>
                  <p className="mt-4 text-2xl font-semibold">
                    {formatPrice(plan.priceCents)}
                    <span className="text-sm font-normal text-foreground/60">/mês</span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-1 text-sm">
                    {limitText(plan.limits).map((line) => (
                      <li key={line}>✓ {line}</li>
                    ))}
                    <li>✓ Todos os módulos (agenda, financeiro, estoque, fidelidade)</li>
                  </ul>
                  {canManage && (
                    <PlanButton
                      plan={id}
                      disabled={isCurrent && !needsPayment}
                      primary={needsPayment || (!isCurrent && id === "equipe")}
                      label={
                        needsPayment
                          ? "Regularizar pagamento"
                          : isCurrent
                            ? "Plano atual"
                            : isPaid
                              ? `Trocar para ${plan.name}`
                              : `Assinar ${plan.name}`
                      }
                    />
                  )}
                </article>
              );
            })}
          </section>
          <p className="mt-3 text-xs text-foreground/60">
            Empresas novas têm {TRIAL_DAYS} dias de teste grátis com todos os recursos. A
            cobrança é mensal e recorrente; você pode cancelar quando quiser.
          </p>
          {canManage && isPaid && (
            <div className="mt-6">
              <CancelButton />
            </div>
          )}
        </>
      )}

      {payments.length > 0 && (
        <section aria-label="Histórico de pagamentos" className="mt-10">
          <h2 className="text-lg font-semibold">Histórico de pagamentos</h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-white/70">
            <table className="w-full text-left text-sm">
              <thead className="text-foreground/60">
                <tr>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Plano</th>
                  <th className="px-4 py-2 font-medium">Valor</th>
                  <th className="px-4 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {[...payments].reverse().map((payment) => (
                  <tr key={payment.id} className="border-t border-border">
                    <td className="px-4 py-2">{formatDate(payment.paidAt ?? payment.createdAt)}</td>
                    <td className="px-4 py-2">
                      {isPlanId(payment.plan) ? PLANS[payment.plan].name : "—"}
                    </td>
                    <td className="px-4 py-2">{formatPrice(payment.amountCents)}</td>
                    <td className="px-4 py-2">{PAYMENT_LABEL[payment.status] ?? payment.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
