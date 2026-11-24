import { isDemoLoginEnabled } from "@/lib/app-env";
import { TRIAL_DAYS } from "@/lib/billing/plans";
import { isConfigured } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { LoginForm } from "./login-form";
import { DemoLoginButton } from "./demo-login-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar" };

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; modo?: string }>;
}) {
  const { next, modo } = await searchParams;
  const signup = modo === "cadastro";

  return (
    <main
      id="conteudo"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16"
    >
      <div className="mb-8 text-center">
        <span className="text-lg font-semibold tracking-tight">
          Glow<span className="text-brand">Hub</span>
        </span>
        <h1 className="mt-4 text-2xl font-semibold">
          {signup ? "Crie sua conta" : "Entrar no painel"}
        </h1>
        <p className="mt-2 text-sm text-foreground/60">
          {signup
            ? `${TRIAL_DAYS} dias grátis com todos os recursos, sem cartão de crédito.`
            : "Acesse com o e-mail cadastrado na sua empresa."}
        </p>
      </div>
      {isConfigured() ? (
        <>
          <LoginForm redirectTo={safeNext(next)} initialMode={signup ? "signup" : "signin"} />
          {isDemoLoginEnabled() && <DemoLoginButton />}
        </>
      ) : (
        <SetupNotice />
      )}
    </main>
  );
}
