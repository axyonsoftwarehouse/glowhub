"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL } from "@/lib/money";
import { createPackageAction, setPackageActiveAction } from "./actions";
import {
  initialPackageActionState,
  type PackageActionState,
  type PackageTemplate,
  type ServiceOption,
} from "./types";

const inputClass =
  "rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

type ItemDraft = { serviceId: string; quantity: string };

export function PackageForm({
  packages,
  services,
  canManage,
}: {
  packages: PackageTemplate[];
  services: ServiceOption[];
  canManage: boolean;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([{ serviceId: "", quantity: "1" }]);
  const [result, setResult] = useState<PackageActionState>(
    initialPackageActionState,
  );
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setResult(initialPackageActionState);
    const payloadItems = items
      .filter((item) => item.serviceId)
      .map((item) => ({
        serviceId: item.serviceId,
        quantity: Number(item.quantity) || 1,
      }));
    startTransition(async () => {
      const next = await createPackageAction({
        name,
        description,
        price,
        validityDays,
        items: payloadItems,
      });
      setResult(next);
      if (next.status === "success") {
        setName("");
        setPrice("");
        setValidityDays("");
        setDescription("");
        setItems([{ serviceId: "", quantity: "1" }]);
      }
    });
  }

  function toggle(id: string, isActive: boolean) {
    setToggleError(null);
    const formData = new FormData();
    formData.set("id", id);
    formData.set("is_active", String(isActive));
    startTransition(async () => {
      const next = await setPackageActiveAction(initialPackageActionState, formData);
      if (next.status === "error") setToggleError(next.message ?? "Erro.");
    });
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <section className="rounded-2xl border border-border bg-white/70 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Novo pacote
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-foreground/60">Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="5 cortes"
                className={`mt-1 w-full ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground/60">Preço (R$)</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="250,00"
                className={`mt-1 w-full ${inputClass}`}
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-foreground/60">
                Validade (dias)
              </label>
              <input
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                placeholder="180 (opcional)"
                className={`mt-1 w-full ${inputClass}`}
              />
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
            <p className="text-xs font-medium text-foreground/60">Serviços inclusos</p>
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
                  value={item.quantity}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, quantity: e.target.value } : row,
                      ),
                    )
                  }
                  type="number"
                  min={1}
                  className={`w-20 ${inputClass}`}
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setItems((prev) => [...prev, { serviceId: "", quantity: "1" }])
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
            {pending ? "Salvando..." : "Criar pacote"}
          </button>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Pacotes disponíveis
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => (
            <article
              key={pkg.id}
              className="rounded-2xl border border-border bg-white/70 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{pkg.name}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    pkg.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {pkg.isActive ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-brand">
                {formatCentsBRL(pkg.priceCents)}
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-foreground/60">
                {pkg.items.map((item) => (
                  <li key={item.serviceId}>
                    {item.quantity}× {item.serviceName}
                  </li>
                ))}
              </ul>
              {canManage && (
                <button
                  type="button"
                  onClick={() => toggle(pkg.id, !pkg.isActive)}
                  disabled={pending}
                  className={`mt-3 text-xs font-medium hover:underline disabled:opacity-60 ${
                    pkg.isActive ? "text-red-600" : "text-brand"
                  }`}
                >
                  {pkg.isActive ? "Desativar" : "Ativar"}
                </button>
              )}
            </article>
          ))}
          {packages.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum pacote cadastrado ainda.
            </p>
          )}
        </div>
        {toggleError && <p className="mt-2 text-xs text-red-600">{toggleError}</p>}
      </section>
    </div>
  );
}
