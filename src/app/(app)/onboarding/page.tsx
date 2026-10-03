import { redirect } from "next/navigation";
import { getUserTenants } from "@/lib/tenant";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const tenants = await getUserTenants();
  if (tenants.length > 0) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md space-y-8">
      <header className="text-center">
        <p className="text-xs uppercase tracking-widest text-brand">Comece agora</p>
        <h1 className="mt-2 text-2xl font-semibold">Crie sua empresa</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Sua empresa é o espaço onde ficam suas filiais, serviços, agenda e
          financeiro. Você entra como proprietário.
        </p>
      </header>

      <OnboardingForm />
    </div>
  );
}
