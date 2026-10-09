"use client";

import { useState, useTransition } from "react";
import { applyCouponAction } from "@/app/(app)/coupons/actions";
import { formatCentsBRL, formatCentsToInput } from "@/lib/money";
import {
  addChargeItemAction,
  createOnlinePaymentAction,
  registerPaymentAction,
  removeChargeItemAction,
} from "./actions";
import {
  initialFinanceActionState,
  type Charge,
  type FinanceActionState,
  type ProductOption,
} from "./types";

const METHODS = [
  { value: "cash", label: "Dinheiro" },
  { value: "debit", label: "Débito" },
  { value: "credit", label: "Crédito" },
  { value: "pix", label: "Pix" },
  { value: "transfer", label: "Transferência" },
  { value: "wallet", label: "Carteira" },
  { value: "other", label: "Outro" },
];

const STATUS_STYLES: Record<Charge["status"], string> = {
  open: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  void: "bg-zinc-100 text-zinc-600",
};

const STATUS_LABELS: Record<Charge["status"], string> = {
  open: "Aberta",
  paid: "Paga",
  void: "Estornada",
};

const smallInput =
  "rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-brand";

export function ChargeList({
  charges,
  productOptions,
  canSettle,
}: {
  charges: Charge[];
  productOptions: ProductOption[];
  canSettle: boolean;
}) {
  const [result, setResult] = useState<FinanceActionState>(
    initialFinanceActionState,
  );
  const [couponResult, setCouponResult] = useState<FinanceActionState>(
    initialFinanceActionState,
  );
  const [itemResult, setItemResult] = useState<FinanceActionState>(
    initialFinanceActionState,
  );
  const [onlineResult, setOnlineResult] = useState<FinanceActionState>(
    initialFinanceActionState,
  );
  const [onlineFor, setOnlineFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handlePayment(formData: FormData) {
    startTransition(async () => {
      setResult(await registerPaymentAction(initialFinanceActionState, formData));
    });
  }

  function handleCoupon(formData: FormData) {
    startTransition(async () => {
      setCouponResult(await applyCouponAction({ status: "idle" }, formData));
    });
  }

  function handleAddItem(formData: FormData) {
    startTransition(async () => {
      setItemResult(
        await addChargeItemAction(initialFinanceActionState, formData),
      );
    });
  }

  function handleRemoveItem(formData: FormData) {
    startTransition(async () => {
      setItemResult(
        await removeChargeItemAction(initialFinanceActionState, formData),
      );
    });
  }

  function handleOnline(formData: FormData) {
    setOnlineFor(String(formData.get("chargeId") ?? ""));
    startTransition(async () => {
      setOnlineResult(
        await createOnlinePaymentAction(initialFinanceActionState, formData),
      );
    });
  }

  if (charges.length === 0) {
    return (
      <p className="text-sm text-foreground/60">
        Nenhuma cobrança registrada ainda.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {charges.map((charge) => {
        const remaining = charge.totalCents - charge.paidCents;
        const isOpen = charge.status === "open";
        return (
          <div
            key={charge.id}
            className="rounded-lg border border-border bg-white/60 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm">{charge.description}</p>
                <span
                  className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLES[charge.status]}`}
                >
                  {STATUS_LABELS[charge.status]}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium">
                  {formatCentsBRL(charge.totalCents)}
                </p>
                {charge.paidCents > 0 && charge.paidCents < charge.totalCents && (
                  <p className="text-[11px] text-foreground/70">
                    pago {formatCentsBRL(charge.paidCents)} · saldo{" "}
                    {formatCentsBRL(remaining)}
                  </p>
                )}
              </div>
            </div>

            {charge.items.length > 0 && (
              <ul className="mt-2 space-y-0.5 border-t border-border pt-2">
                {charge.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 text-xs text-foreground/70"
                  >
                    <span className="min-w-0 truncate">
                      {item.quantity}× {item.description}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span>{formatCentsBRL(item.totalCents)}</span>
                      {canSettle && isOpen && item.kind === "product" && (
                        <form action={handleRemoveItem}>
                          <input type="hidden" name="id" value={item.id} />
                          <button
                            type="submit"
                            disabled={pending}
                            className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-60"
                          >
                            remover
                          </button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {canSettle && isOpen && productOptions.length > 0 && (
              <form
                action={handleAddItem}
                className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2"
              >
                <input type="hidden" name="chargeId" value={charge.id} />
                <select name="variantId" defaultValue="" className={smallInput}>
                  <option value="" disabled>
                    Adicionar produto…
                  </option>
                  {productOptions.map((option) => (
                    <option key={option.variantId} value={option.variantId}>
                      {option.label} — {formatCentsBRL(option.priceCents)} (
                      {option.stockQuantity} em estoque)
                    </option>
                  ))}
                </select>
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  defaultValue={1}
                  aria-label="Quantidade"
                  className={`w-16 ${smallInput}`}
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                >
                  {pending ? "..." : "Adicionar"}
                </button>
              </form>
            )}

            {canSettle && isOpen && remaining > 0 && (
              <form
                action={handlePayment}
                className="mt-2 flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="chargeId" value={charge.id} />
                <select name="method" defaultValue="cash" className={smallInput}>
                  {METHODS.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
                <input
                  name="amount"
                  defaultValue={formatCentsToInput(remaining)}
                  className={`w-24 ${smallInput}`}
                />
                <input
                  name="tip"
                  placeholder="Gorjeta"
                  className={`w-20 ${smallInput}`}
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-foreground disabled:opacity-60"
                >
                  {pending ? "..." : "Receber"}
                </button>
              </form>
            )}

            {canSettle && isOpen && (
              <form
                action={handleCoupon}
                className="mt-2 flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="chargeId" value={charge.id} />
                <input
                  name="code"
                  placeholder="Cupom"
                  className={`w-28 uppercase ${smallInput}`}
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                >
                  Aplicar cupom
                </button>
              </form>
            )}

            {canSettle && isOpen && remaining > 0 && (
              <form
                action={handleOnline}
                className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2"
              >
                <input type="hidden" name="chargeId" value={charge.id} />
                <select name="method" defaultValue="pix" className={smallInput}>
                  <option value="pix">Pix</option>
                  <option value="credit">Cartão de crédito</option>
                  <option value="debit">Cartão de débito</option>
                </select>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                >
                  {pending ? "..." : "Cobrar online"}
                </button>
                {onlineFor === charge.id &&
                  onlineResult.status === "error" &&
                  onlineResult.message && (
                    <span className="text-xs text-red-600">
                      {onlineResult.message}
                    </span>
                  )}
                {onlineFor === charge.id &&
                  onlineResult.status === "success" &&
                  onlineResult.checkoutUrl && (
                    <a
                      href={onlineResult.checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      Abrir checkout →
                    </a>
                  )}
              </form>
            )}
          </div>
        );
      })}

      {result.status === "error" && result.message && (
        <p className="text-xs text-red-600">{result.message}</p>
      )}
      {result.status === "success" && result.message && (
        <p className="text-xs text-emerald-700">{result.message}</p>
      )}
      {couponResult.status === "error" && couponResult.message && (
        <p className="text-xs text-red-600">{couponResult.message}</p>
      )}
      {couponResult.status === "success" && couponResult.message && (
        <p className="text-xs text-emerald-700">{couponResult.message}</p>
      )}
      {itemResult.status === "error" &&
        (itemResult.message ??
          Object.values(itemResult.fieldErrors ?? {})[0]?.[0]) && (
          <p className="text-xs text-red-600">
            {itemResult.message ??
              Object.values(itemResult.fieldErrors ?? {})[0]?.[0]}
          </p>
        )}
      {itemResult.status === "success" && itemResult.message && (
        <p className="text-xs text-emerald-700">{itemResult.message}</p>
      )}
    </div>
  );
}
