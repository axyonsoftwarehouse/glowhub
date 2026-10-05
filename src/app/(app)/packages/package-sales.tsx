"use client";

import { useState, useTransition } from "react";
import { redeemPackageServiceAction, sellPackageAction } from "./actions";
import {
  initialPackageActionState,
  type ClientOption,
  type PackageActionState,
  type PackageTemplate,
  type SoldPackage,
} from "./types";

const inputClass =
  "rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

const METHODS = [
  { value: "cash", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "debit", label: "Débito" },
  { value: "credit", label: "Crédito" },
];

const STATUS_LABELS: Record<SoldPackage["status"], string> = {
  active: "Ativo",
  used: "Esgotado",
  expired: "Expirado",
  cancelled: "Cancelado",
};

export function PackageSales({
  packages,
  clients,
  sold,
  canManage,
}: {
  packages: PackageTemplate[];
  clients: ClientOption[];
  sold: SoldPackage[];
  canManage: boolean;
}) {
  const [sellState, setSellState] = useState<PackageActionState>(
    initialPackageActionState,
  );
  const [redeemState, setRedeemState] = useState<PackageActionState>(
    initialPackageActionState,
  );
  const [pending, startTransition] = useTransition();

  function sell(formData: FormData) {
    startTransition(async () => {
      setSellState(await sellPackageAction(initialPackageActionState, formData));
    });
  }

  function redeem(formData: FormData) {
    startTransition(async () => {
      setRedeemState(
        await redeemPackageServiceAction(initialPackageActionState, formData),
      );
    });
  }

  return (
    <div className="space-y-6">
      {canManage && packages.length > 0 && clients.length > 0 && (
        <section className="rounded-2xl border border-border bg-white/70 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Vender pacote
          </h2>
          <form action={sell} className="mt-4 flex flex-wrap items-end gap-2">
            <select name="clientId" defaultValue="" className={inputClass}>
              <option value="">Cliente...</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <select name="packageId" defaultValue="" className={inputClass}>
              <option value="">Pacote...</option>
              {packages
                .filter((pkg) => pkg.isActive)
                .map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name}
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
              Vender
            </button>
          </form>
          {sellState.status === "error" && (
            <p className="mt-2 text-xs text-red-600">
              {sellState.message ?? "Verifique os campos."}
            </p>
          )}
          {sellState.status === "success" && (
            <p className="mt-2 text-xs text-emerald-700">{sellState.message}</p>
          )}
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Pacotes vendidos
        </h2>
        <div className="mt-4 space-y-2">
          {sold.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border bg-white/70 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {item.packageName} · {item.clientName}
                  </p>
                  <p className="text-xs text-foreground/70">
                    {STATUS_LABELS[item.status]}
                    {item.expiresAt
                      ? ` · expira ${item.expiresAt.slice(0, 10)}`
                      : ""}
                  </p>
                </div>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-foreground/60">
                {item.items.map((pi) => (
                  <li key={pi.serviceId}>
                    {pi.serviceName}: {pi.redeemed}/{pi.quantity} usado(s)
                  </li>
                ))}
              </ul>

              {canManage &&
                item.status === "active" &&
                item.items.some((pi) => pi.redeemed < pi.quantity) && (
                  <form action={redeem} className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="hidden"
                      name="clientPackageId"
                      value={item.id}
                    />
                    <select name="serviceId" defaultValue="" className={inputClass}>
                      <option value="">Serviço a resgatar...</option>
                      {item.items
                        .filter((pi) => pi.redeemed < pi.quantity)
                        .map((pi) => (
                          <option key={pi.serviceId} value={pi.serviceId}>
                            {pi.serviceName}
                          </option>
                        ))}
                    </select>
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                    >
                      Resgatar
                    </button>
                  </form>
                )}
            </div>
          ))}
          {sold.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum pacote vendido ainda.
            </p>
          )}
        </div>
        {redeemState.status === "error" && (
          <p className="mt-2 text-xs text-red-600">{redeemState.message}</p>
        )}
        {redeemState.status === "success" && (
          <p className="mt-2 text-xs text-emerald-700">{redeemState.message}</p>
        )}
      </section>
    </div>
  );
}
