"use client";

import { useRef, useState, useTransition } from "react";
import { formatCentsBRL } from "@/lib/money";
import {
  createAccountAction,
  createDefaultChartAction,
  setAccountActiveAction,
} from "./actions";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  initialFinanceActionState,
  type AccountType,
  type FinanceActionState,
  type LedgerAccount,
} from "./types";

type Balance = { debitCents: number; creditCents: number };

function normalBalance(type: AccountType, balance: Balance): number {
  return type === "asset" || type === "expense"
    ? balance.debitCents - balance.creditCents
    : balance.creditCents - balance.debitCents;
}

export function AccountManager({
  accounts,
  balances,
  canManage,
}: {
  accounts: LedgerAccount[];
  balances: Record<string, Balance>;
  canManage: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [createState, setCreateState] = useState<FinanceActionState>(
    initialFinanceActionState,
  );
  const [chartState, setChartState] = useState<FinanceActionState>(
    initialFinanceActionState,
  );
  const [toggleState, setToggleState] = useState<FinanceActionState>(
    initialFinanceActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const next = await createAccountAction(initialFinanceActionState, formData);
      setCreateState(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  function handleDefaultChart() {
    startTransition(async () => {
      setChartState(await createDefaultChartAction());
    });
  }

  function handleToggle(id: string, isActive: boolean) {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("is_active", String(isActive));
    startTransition(async () => {
      setToggleState(await setAccountActiveAction(initialFinanceActionState, formData));
    });
  }

  const e = createState.fieldErrors ?? {};
  const grouped = ACCOUNT_TYPES.map((type) => ({
    ...type,
    items: accounts
      .filter((account) => account.type === type.value)
      .sort((a, b) => a.code.localeCompare(b.code)),
  }));

  return (
    <section className="rounded-2xl border border-border bg-white/70 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Plano de contas
        </h2>
        {canManage && accounts.length === 0 && (
          <button
            type="button"
            onClick={handleDefaultChart}
            disabled={pending}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
          >
            Criar plano padrão
          </button>
        )}
      </div>

      {canManage && (
        <form ref={formRef} action={handleCreate} className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs font-medium text-foreground/60">Código</label>
            <input
              name="code"
              placeholder="4.4"
              className="mt-1 w-24 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            {e.code?.[0] && <p className="mt-1 text-xs text-red-600">{e.code[0]}</p>}
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-foreground/60">Nome</label>
            <input
              name="name"
              placeholder="Receita de Assinaturas"
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            {e.name?.[0] && <p className="mt-1 text-xs text-red-600">{e.name[0]}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60">Tipo</label>
            <select
              name="type"
              className="mt-1 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {ACCOUNT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            Adicionar
          </button>
        </form>
      )}

      {createState.status === "error" && createState.message && (
        <p className="mt-2 text-xs text-red-600">{createState.message}</p>
      )}
      {chartState.status === "error" && chartState.message && (
        <p className="mt-2 text-xs text-red-600">{chartState.message}</p>
      )}
      {toggleState.status === "error" && toggleState.message && (
        <p className="mt-2 text-xs text-red-600">{toggleState.message}</p>
      )}

      <div className="mt-4 space-y-4">
        {grouped.map((group) => (
          <div key={group.value}>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
              {group.label}
            </p>
            <div className="mt-2 space-y-1">
              {group.items.map((account) => {
                const balance = balances[account.id] ?? {
                  debitCents: 0,
                  creditCents: 0,
                };
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white/60 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm">
                      <span className="font-mono text-xs text-foreground/50">
                        {account.code}
                      </span>{" "}
                      {account.name}
                    </span>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-medium">
                        {formatCentsBRL(normalBalance(account.type, balance))}
                      </span>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => handleToggle(account.id, !account.isActive)}
                          disabled={pending}
                          className={`text-xs font-medium hover:underline disabled:opacity-60 ${
                            account.isActive ? "text-red-600" : "text-brand"
                          }`}
                        >
                          {account.isActive ? "Desativar" : "Ativar"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {group.items.length === 0 && (
                <p className="text-xs text-foreground/40">
                  Nenhuma conta de {ACCOUNT_TYPE_LABELS[group.value].toLowerCase()}.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
