import { isConfigured } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { LoginForm } from "./login-form";
import { DemoLoginButton } from "./demo-login-button";

export const dynamic = "force-dynamic";

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main
      id="conteudo"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16"
    >
      <div className="mb-8 text-center">
        <span className="text-lg font-semibold tracking-tight">
          Glow<span className="text-brand">Hub</span>
        </span>
        <h1 className="mt-4 text-2xl font-semibold">Entrar no painel</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Acesse com o e-mail cadastrado na sua empresa.
        </p>
      </div>
      {isConfigured() ? (
        <>
          <LoginForm redirectTo={safeNext(next)} />
          {process.env.NEXT_PUBLIC_DEMO_LOGIN !== "false" && <DemoLoginButton />}
        </>
      ) : (
        <SetupNotice />
      )}
    </main>
  );
}
