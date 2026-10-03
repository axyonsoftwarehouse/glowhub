"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL } from "@/lib/money";
import {
  createPlanAction,
  setPlanActiveAction,
} from "./actions";
import {
  initialSubscriptionActionState,
  type ServiceOption,
  type SubscriptionActionState,
  type SubscriptionPlan,
} from "./types";

const inputClass =
  "rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

type ItemDraft = { serviceId: string; quantityPerPeriod: string };

export function PlanForm({
  plans,
  services,
  canManage,
}: {
  plans: SubscriptionPlan[];
  services: ServiceOption[];
  canManage: boolean;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [result, setResult] = useState<SubscriptionActionState>(
    initialSubscriptionActionState,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setResult(initialSubscriptionActionState);
    startTransition(async () => {
      const next = await createPlanAction({
        name,
        description,
        price,
        interval,
        items: items
          .filter((item) => item.serviceId)
          .map((item) => ({
            serviceId: item.serviceId,
            quantityPerPeriod: Number(item.quantityPerPeriod) || 1,
          })),
      });
      setResult(next);
      if (next.status === "success") {
        setName("");
        setPrice("");
        setDescription("");
        setItems([]);
      }
    });
  }

  function toggle(id: string, isActive: boolean) {
    setError(null);
    const formData = new FormData();
    formData.set("id", id);
    formData.set("is_active", String(isActive));
    startTransition(async () => {
      const next = await setPlanActiveAction(
        initialSubscriptionActionState,
        formData,
      );
      if (next.status === "error") setError(next.message ?? "Erro.");
    });
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <section className="rounded-2xl border border-border bg-white/70 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Novo plano
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-foreground/60">Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Assinatura Premium"
                className={`mt-1 w-full ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground/60">Preço (R$)</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="199,00"
                className={`mt-1 w-full ${inputClass}`}
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-foreground/60">
                Periodicidade
              </label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value as "month" | "year")}
                className={`mt-1 w-full ${inputClass}`}
              >
                <option value="month">Mensal</option>
                <option value="year">Anual</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-foreground/60">
                Descrição (opcional)
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`mt-1 w-full ${inputClass}`}
              />
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-foreground/60">
              Benefícios (serviços incluídos por período)
            </p>
            {items.map((item, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <select
                  value={item.serviceId}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, serviceId: e.target.value } : row,
                      ),
                    )
                  }
                  className={`flex-1 ${inputClass}`}
                >
                  <option value="">Serviço...</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
                <input
                  value={item.quantityPerPeriod}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) =>
                        i === index
                          ? { ...row, quantityPerPeriod: e.target.value }
                          : row,
                      ),
                    )
                  }
                  type="number"
                  min={1}
                  className={`w-20 ${inputClass}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    setItems((prev) => prev.filter((_, i) => i !== index))
                  }
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Remover
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setItems((prev) => [
                  ...prev,
                  { serviceId: "", quantityPerPeriod: "1" },
                ])
              }
              className="text-xs font-medium text-brand hover:underline"
            >
              + serviço
            </button>
          </div>

          {result.status === "error" && (
            <p className="mt-3 text-sm text-red-600">
              {result.message ?? "Verifique os campos."}
            </p>
          )}
          {result.status === "success" && (
            <p className="mt-3 text-sm text-emerald-700">{result.message}</p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            {pending ? "Salvando..." : "Criar plano"}
          </button>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Planos
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className="rounded-2xl border border-border bg-white/70 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{plan.name}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    plan.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {plan.isActive ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-brand">
                {formatCentsBRL(plan.priceCents)}/
                {plan.interval === "month" ? "mês" : "ano"}
              </p>
              {plan.items.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-foreground/60">
                  {plan.items.map((item) => (
                    <li key={item.serviceId}>
                      {item.quantityPerPeriod}× {item.serviceName}
                    </li>
                  ))}
                </ul>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => toggle(plan.id, !plan.isActive)}
                  disabled={pending}
                  className={`mt-3 text-xs font-medium hover:underline disabled:opacity-60 ${
                    plan.isActive ? "text-red-600" : "text-brand"
                  }`}
                >
                  {plan.isActive ? "Desativar" : "Ativar"}
                </button>
              )}
            </article>
          ))}
          {plans.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum plano cadastrado ainda.
            </p>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </section>
    </div>
  );
}
