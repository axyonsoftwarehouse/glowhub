import Link from "next/link";
import { AuthCard } from "../auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Nova senha · GlowHub" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token || error) {
    return (
      <AuthCard title="Link inválido ou expirado">
        <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
          <p className="text-foreground/70">
            O link de redefinição de senha não é mais válido. Ele vale por 1 hora
            e só pode ser usado uma vez.
          </p>
          <Link
            href="/forgot-password"
            className="mt-5 block w-full rounded-full bg-brand px-4 py-2.5 text-center font-medium text-brand-foreground"
          >
            Pedir um novo link
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Criar nova senha"
      subtitle="Ao salvar, as sessões abertas em outros aparelhos serão encerradas."
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
