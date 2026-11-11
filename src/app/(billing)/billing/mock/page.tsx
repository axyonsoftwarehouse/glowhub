import { notFound } from "next/navigation";
import { getAppEnv } from "@/lib/app-env";
import { formatPrice } from "@/lib/billing/plans";
import { simulateMockPaymentAction } from "../actions";

export const metadata = { title: "Pagamento simulado · GlowHub" };

/** Checkout simulado do provedor `mock` (apenas APP_ENV=dev). */
export default async function MockBillingCheckout({
  searchParams,
}: {
  searchParams: Promise<{ sub?: string; plan?: string; amount?: string }>;
}) {
  if (getAppEnv() !== "dev") notFound();
  const { sub = "", plan = "", amount = "0" } = await searchParams;

  return (
    <main id="conteudo" className="mx-auto w-full max-w-md flex-1 px-6 py-16">
      <div className="rounded-2xl border border-dashed border-amber-400 bg-amber-50 p-6 text-sm">
        <p className="text-xs uppercase tracking-wide text-amber-800">Ambiente de testes</p>
        <h1 className="mt-2 text-xl font-semibold">Pagamento simulado</h1>
        <p className="mt-2">
          Assinatura do plano <strong>{plan}</strong>: {formatPrice(Number(amount) || 0)}/mês.
        </p>
        <form action={simulateMockPaymentAction} className="mt-5 flex gap-3">
          <input type="hidden" name="sub" value={sub} />
          <input type="hidden" name="amount" value={amount} />
          <button
            type="submit"
            name="decision"
            value="approved"
            className="flex-1 rounded-full bg-brand px-4 py-2.5 font-medium text-brand-foreground"
          >
            Aprovar
          </button>
          <button
            type="submit"
            name="decision"
            value="rejected"
            className="flex-1 rounded-full border border-border bg-white px-4 py-2.5 font-medium"
          >
            Recusar
          </button>
        </form>
      </div>
    </main>
  );
}
