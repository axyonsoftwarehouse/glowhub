"use client";

import { useState, useTransition } from "react";
import { switchTenantAction } from "./actions";
import type { UserTenant } from "@/lib/tenant";

export function TenantSwitcher({
  tenants,
  activeTenantId,
}: {
  tenants: UserTenant[];
  activeTenantId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active = tenants.find((tenant) => tenant.id === activeTenantId);

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const tenantId = event.target.value;
    if (!tenantId || tenantId === activeTenantId) return;

    setError(null);
    startTransition(async () => {
      const result = await switchTenantAction(tenantId);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="mt-6 rounded-xl bg-muted p-3 text-sm">
      <label
        htmlFor="tenant-switcher"
        className="text-xs uppercase tracking-wide text-foreground/70"
      >
        Empresa
      </label>
      <select
        id="tenant-switcher"
        value={activeTenantId ?? ""}
        onChange={handleChange}
        disabled={pending}
        className="mt-1 w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm font-medium outline-none focus:border-brand disabled:opacity-60"
      >
        {!active && <option value="">Selecione...</option>}
        {tenants.map((tenant) => (
          <option key={tenant.id} value={tenant.id}>
            {tenant.name}
          </option>
        ))}
      </select>
      {active && (
        <p className="mt-1 text-xs text-foreground/70">
          /{active.slug} · {active.role}
        </p>
      )}
      {pending && <p className="mt-1 text-xs text-foreground/70">Trocando...</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
