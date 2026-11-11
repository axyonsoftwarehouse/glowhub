"use client";

import { useActionState } from "react";
import { cancelAction, checkoutAction, type BillingActionState } from "./actions";

const INITIAL: BillingActionState = { status: "idle" };

export function PlanButton({
  plan,
  label,
  disabled,
  primary,
}: {
  plan: string;
  label: string;
  disabled?: boolean;
  primary?: boolean;
}) {
  const [state, action, pending] = useActionState(checkoutAction, INITIAL);
  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="plan" value={plan} />
      <button
        type="submit"
        disabled={disabled || pending}
        className={`w-full rounded-full px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${
          primary
            ? "bg-brand text-brand-foreground"
            : "border border-border bg-white hover:bg-muted"
        }`}
      >
        {pending ? "Abrindo pagamento..." : label}
      </button>
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function CancelButton() {
  const [state, action, pending] = useActionState(() => cancelAction(), INITIAL);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm("Cancelar a assinatura? O acesso continua até o fim do período já pago.")) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-red-700 underline disabled:opacity-60"
      >
        {pending ? "Cancelando..." : "Cancelar assinatura"}
      </button>
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`mt-1 text-xs ${state.status === "error" ? "text-red-600" : "text-emerald-700"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
