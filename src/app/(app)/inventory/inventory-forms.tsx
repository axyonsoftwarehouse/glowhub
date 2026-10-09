"use client";

import { useRef, useState, useTransition } from "react";
import {
  createSupplierAction,
  recordAdjustmentAction,
  recordPurchaseAction,
} from "./actions";
import {
  initialInventoryActionState,
  type InventoryActionState,
  type InventoryVariantOption,
  type SupplierRow,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

function Feedback({ state }: { state: InventoryActionState }) {
  if (state.status === "error" && (state.message || state.fieldErrors)) {
    return (
      <p className="text-sm text-red-600">
        {state.message ?? Object.values(state.fieldErrors ?? {})[0]?.[0]}
      </p>
    );
  }
  if (state.status === "success" && state.message) {
    return <p className="text-sm text-emerald-700">{state.message}</p>;
  }
  return null;
}

function VariantSelect({
  variants,
}: {
  variants: InventoryVariantOption[];
}) {
  return (
    <select name="variantId" defaultValue="" className={inputClass}>
      <option value="" disabled>
        Selecione o item
      </option>
      {variants.map((variant) => (
        <option key={variant.variantId} value={variant.variantId}>
          {variant.label} — {variant.stockQuantity} {variant.unit}
        </option>
      ))}
    </select>
  );
}

export function InventoryForms({
  variants,
  suppliers,
}: {
  variants: InventoryVariantOption[];
  suppliers: SupplierRow[];
}) {
  const purchaseRef = useRef<HTMLFormElement>(null);
  const adjustmentRef = useRef<HTMLFormElement>(null);
  const [purchaseResult, setPurchaseResult] = useState<InventoryActionState>(
    initialInventoryActionState,
  );
  const [adjustmentResult, setAdjustmentResult] = useState<InventoryActionState>(
    initialInventoryActionState,
  );
  const [pending, startTransition] = useTransition();

  function handlePurchase(formData: FormData) {
    startTransition(async () => {
      const next = await recordPurchaseAction(
        initialInventoryActionState,
        formData,
      );
      setPurchaseResult(next);
      if (next.status === "success") purchaseRef.current?.reset();
    });
  }

  function handleAdjustment(formData: FormData) {
    startTransition(async () => {
      const next = await recordAdjustmentAction(
        initialInventoryActionState,
        formData,
      );
      setAdjustmentResult(next);
      if (next.status === "success") adjustmentRef.current?.reset();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <details className="rounded-2xl border border-border bg-white/70 p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          Entrada de estoque (compra)
        </summary>
        <form ref={purchaseRef} action={handlePurchase} className="mt-4 space-y-3">
          <VariantSelect variants={variants} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="quantity"
              type="number"
              min={1}
              defaultValue={1}
              placeholder="Quantidade"
              className={inputClass}
            />
            <input
              name="unitCost"
              placeholder="Custo unitário (R$)"
              className={inputClass}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="supplierId" defaultValue="" className={inputClass}>
              <option value="">Sem fornecedor</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            <select name="paymentMethod" defaultValue="cash" className={inputClass}>
              <option value="cash">Pago à vista (Caixa)</option>
              <option value="payable">A prazo (Contas a Pagar)</option>
            </select>
          </div>
          <Feedback state={purchaseResult} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            {pending ? "Registrando..." : "Registrar entrada"}
          </button>
        </form>
      </details>

      <details className="rounded-2xl border border-border bg-white/70 p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          Ajuste / perda de estoque
        </summary>
        <form ref={adjustmentRef} action={handleAdjustment} className="mt-4 space-y-3">
          <VariantSelect variants={variants} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="quantityDelta"
              type="number"
              defaultValue={0}
              placeholder="Quantidade (negativo = baixa)"
              className={inputClass}
            />
            <select name="kind" defaultValue="adjustment" className={inputClass}>
              <option value="adjustment">Ajuste de inventário</option>
              <option value="loss">Perda / quebra</option>
            </select>
          </div>
          <input
            name="notes"
            placeholder="Observação (opcional)"
            className={inputClass}
          />
          <Feedback state={adjustmentResult} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {pending ? "Registrando..." : "Registrar ajuste"}
          </button>
        </form>
      </details>
    </div>
  );
}

export function SupplierForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<InventoryActionState>(
    initialInventoryActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await createSupplierAction(
        initialInventoryActionState,
        formData,
      );
      setResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  return (
    <details className="mt-4 rounded-2xl border border-border bg-white/70 p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Novo fornecedor
      </summary>
      <form ref={formRef} action={handleSubmit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="name" placeholder="Nome do fornecedor" className={inputClass} />
          <input
            name="contact"
            placeholder="Contato (telefone, e-mail)"
            className={inputClass}
          />
        </div>
        <input name="notes" placeholder="Observações (opcional)" className={inputClass} />
        <Feedback state={result} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Cadastrar fornecedor"}
        </button>
      </form>
    </details>
  );
}
