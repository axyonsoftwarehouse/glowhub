import Link from "next/link";
import { getSession } from "@/lib/session";
import { AuthCard } from "../auth-card";

export const metadata = { title: "Confirmação de e-mail · GlowHub" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  if (error) {
    return (
      <AuthCard title="Não foi possível confirmar">
        <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
          <p className="text-foreground/70">
            O link de confirmação é inválido ou expirou (vale por 24 horas).
            Entre na sua conta e peça um novo link no aviso do topo do painel.
          </p>
          <Link
            href="/login"
            className="mt-5 block w-full rounded-full bg-brand px-4 py-2.5 text-center font-medium text-brand-foreground"
          >
            Ir para o login
          </Link>
        </div>
      </AuthCard>
    );
  }

  const session = await getSession();
  const href = session?.user ? "/dashboard" : "/login";

  return (
    <AuthCard title="E-mail confirmado">
      <div
        role="status"
        className="rounded-2xl border border-border bg-white/70 p-6 text-sm"
      >
        <p className="text-foreground/70">Obrigado! Seu e-mail foi confirmado.</p>
        <Link
          href={href}
          className="mt-5 block w-full rounded-full bg-brand px-4 py-2.5 text-center font-medium text-brand-foreground"
        >
          {session?.user ? "Ir para o painel" : "Entrar"}
        </Link>
      </div>
    </AuthCard>
  );
}
