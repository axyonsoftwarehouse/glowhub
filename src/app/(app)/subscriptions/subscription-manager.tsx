"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL } from "@/lib/money";
import {
  cancelSubscriptionAction,
  renewSubscriptionAction,
  subscribeAction,
} from "./actions";
import {
  initialSubscriptionActionState,
  type ClientOption,
  type ClientSubscription,
  type SubscriptionActionState,
  type SubscriptionPlan,
} from "./types";

const inputClass =
  "rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

const METHODS = [
  { value: "cash", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "debit", label: "Débito" },
  { value: "credit", label: "Crédito" },
];

const STATUS_LABELS: Record<ClientSubscription["status"], string> = {
  active: "Ativa",
  cancelled: "Cancelada",
  past_due: "Em atraso",
};

export function SubscriptionManager({
  plans,
  clients,
  subscriptions,
  canManage,
}: {
  plans: SubscriptionPlan[];
  clients: ClientOption[];
  subscriptions: ClientSubscription[];
  canManage: boolean;
}) {
  const [result, setResult] = useState<SubscriptionActionState>(
    initialSubscriptionActionState,
  );
  const [pending, startTransition] = useTransition();

  function run(
    fn: (
      prev: SubscriptionActionState,
      formData: FormData,
    ) => Promise<SubscriptionActionState>,
  ) {
    return (formData: FormData) => {
      startTransition(async () => {
        setResult(await fn(initialSubscriptionActionState, formData));
      });
    };
  }

  const subscribe = run(subscribeAction);
  const renew = run(renewSubscriptionAction);
  const cancel = run(cancelSubscriptionAction);

  return (
    <div className="space-y-6">
      {canManage && plans.length > 0 && clients.length > 0 && (
        <section className="rounded-2xl border border-border bg-white/70 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Assinar cliente
          </h2>
          <form action={subscribe} className="mt-4 flex flex-wrap items-end gap-2">
            <select name="clientId" defaultValue="" className={inputClass}>
              <option value="">Cliente...</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <select name="planId" defaultValue="" className={inputClass}>
              <option value="">Plano...</option>
              {plans
                .filter((plan) => plan.isActive)
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
            </select>
            <select name="method" defaultValue="cash" className={inputClass}>
              {METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
            >
              Assinar
            </button>
          </form>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Assinaturas
        </h2>
        <div className="mt-4 space-y-2">
          {subscriptions.map((sub) => (
            <div
              key={sub.id}
              className="rounded-xl border border-border bg-white/70 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {sub.planName} · {sub.clientName}
                  </p>
                  <p className="text-xs text-foreground/50">
                    {STATUS_LABELS[sub.status]} ·{" "}
                    {formatCentsBRL(sub.priceCents)}/
                    {sub.interval === "month" ? "mês" : "ano"} · próx. período{" "}
                    {sub.currentPeriodEnd.slice(0, 10)}
                  </p>
                </div>
              </div>

              {canManage && sub.status !== "cancelled" && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <form action={renew} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={sub.id} />
                    <select name="method" defaultValue="cash" className={inputClass}>
                      {METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                    >
                      Renovar
                    </button>
                  </form>
                  <form action={cancel}>
                    <input type="hidden" name="id" value={sub.id} />
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium text-red-600 hover:bg-muted disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
          {subscriptions.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhuma assinatura ainda.
            </p>
          )}
        </div>

        {result.status === "error" && (
          <p className="mt-2 text-xs text-red-600">{result.message}</p>
        )}
        {result.status === "success" && (
          <p className="mt-2 text-xs text-emerald-700">{result.message}</p>
        )}
      </section>
    </div>
  );
}
