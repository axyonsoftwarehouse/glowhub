import { MockCheckout } from "./mock-checkout";

export const dynamic = "force-dynamic";

export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const refParam = sp.ref;
  const providerRef = typeof refParam === "string" ? refParam : "";
  const amountRaw = typeof sp.amount === "string" ? Number(sp.amount) : 0;
  const amountCents = Number.isFinite(amountRaw) ? amountRaw : 0;

  return (
    <main className="min-h-screen bg-muted/40">
      <MockCheckout providerRef={providerRef} amountCents={amountCents} />
    </main>
  );
}
