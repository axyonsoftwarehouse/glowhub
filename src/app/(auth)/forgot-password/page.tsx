import Link from "next/link";
import { AuthCard } from "../auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Esqueci minha senha · GlowHub" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Esqueci minha senha"
      subtitle="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."
    >
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-brand hover:underline">
          Voltar para o login
        </Link>
      </p>
    </AuthCard>
  );
}
