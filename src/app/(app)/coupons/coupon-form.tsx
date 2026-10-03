"use client";

import { useRef, useState, useTransition } from "react";
import { formatCentsBRL } from "@/lib/money";
import { createCouponAction, setCouponActiveAction } from "./actions";
import {
  initialCouponActionState,
  type Coupon,
  type CouponActionState,
} from "./types";

const inputClass =
  "rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

function describe(coupon: Coupon): string {
  const base =
    coupon.discountType === "percent"
      ? `${coupon.discountValue / 100}%`
      : formatCentsBRL(coupon.discountValue);
  if (coupon.minAmountCents > 0) {
    return `${base} (mín. ${formatCentsBRL(coupon.minAmountCents)})`;
  }
  return base;
}

export function CouponForm({
  coupons,
  canManage,
}: {
  coupons: Coupon[];
  canManage: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<CouponActionState>(
    initialCouponActionState,
  );
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const next = await createCouponAction(initialCouponActionState, formData);
      setResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  function toggle(id: string, isActive: boolean) {
    setToggleError(null);
    const formData = new FormData();
    formData.set("id", id);
    formData.set("is_active", String(isActive));
    startTransition(async () => {
      const next = await setCouponActiveAction(initialCouponActionState, formData);
      if (next.status === "error") setToggleError(next.message ?? "Erro.");
    });
  }

  const e = result.fieldErrors ?? {};

  return (
    <div className="space-y-6">
      {canManage && (
        <section className="rounded-2xl border border-border bg-white/70 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Novo cupom
          </h2>
          <form ref={formRef} action={submit} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="text-xs font-medium text-foreground/60">Código</label>
                <input name="code" placeholder="BEMVINDO10" className={`mt-1 w-full ${inputClass}`} />
                {e.code?.[0] && <p className="mt-1 text-xs text-red-600">{e.code[0]}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-foreground/60">Tipo</label>
                <select name="type" defaultValue="percent" className={`mt-1 w-full ${inputClass}`}>
                  <option value="percent">Percentual (%)</option>
                  <option value="fixed">Valor fixo (R$)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground/60">Valor</label>
                <input name="value" placeholder="10 ou 20,00" className={`mt-1 w-full ${inputClass}`} />
                {e.value?.[0] && <p className="mt-1 text-xs text-red-600">{e.value[0]}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-foreground/60">Mínimo (R$)</label>
                <input name="minAmount" placeholder="0,00" className={`mt-1 w-full ${inputClass}`} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="text-xs font-medium text-foreground/60">Usos máx.</label>
                <input name="maxUses" placeholder="ilimitado" className={`mt-1 w-full ${inputClass}`} />
                {e.maxUses?.[0] && <p className="mt-1 text-xs text-red-600">{e.maxUses[0]}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-foreground/60">Expira em</label>
                <input type="date" name="expiresAt" className={`mt-1 w-full ${inputClass}`} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-foreground/60">Descrição</label>
                <input name="description" className={`mt-1 w-full ${inputClass}`} />
              </div>
            </div>

            {result.status === "error" && result.message && (
              <p className="text-sm text-red-600">{result.message}</p>
            )}
            {result.status === "success" && result.message && (
              <p className="text-sm text-emerald-700">{result.message}</p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
            >
              {pending ? "Salvando..." : "Criar cupom"}
            </button>
          </form>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Cupons
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {coupons.map((coupon) => (
            <article
              key={coupon.id}
              className="rounded-2xl border border-border bg-white/70 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-sm font-semibold">{coupon.code}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    coupon.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {coupon.isActive ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="mt-1 text-sm text-brand">{describe(coupon)}</p>
              <p className="mt-1 text-xs text-foreground/50">
                {coupon.usedCount} uso(s)
                {coupon.maxUses != null ? ` / ${coupon.maxUses}` : ""}
              </p>
              {coupon.description && (
                <p className="mt-1 text-xs text-foreground/60">{coupon.description}</p>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => toggle(coupon.id, !coupon.isActive)}
                  disabled={pending}
                  className={`mt-3 text-xs font-medium hover:underline disabled:opacity-60 ${
                    coupon.isActive ? "text-red-600" : "text-brand"
                  }`}
                >
                  {coupon.isActive ? "Desativar" : "Ativar"}
                </button>
              )}
            </article>
          ))}
          {coupons.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum cupom cadastrado ainda.
            </p>
          )}
        </div>
        {toggleError && <p className="mt-2 text-xs text-red-600">{toggleError}</p>}
      </section>
    </div>
  );
}
