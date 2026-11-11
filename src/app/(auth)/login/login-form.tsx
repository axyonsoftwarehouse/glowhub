"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function LoginForm({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === "signup") {
      const { data, error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name,
        callbackURL: "/verify-email",
      });
      if (signUpError) {
        setError(authErrorMessage(signUpError, "Não foi possível criar a conta."));
        setLoading(false);
        return;
      }
      // Com verificacao obrigatoria o cadastro nao abre sessao: a pessoa precisa
      // confirmar o e-mail antes de entrar.
      if (!data?.token) {
        setMessage(
          `Conta criada. Enviamos um link de confirmação para ${email}; confirme para entrar.`,
        );
        setMode("signin");
        setPassword("");
        setLoading(false);
        return;
      }
    } else {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
        callbackURL: "/verify-email",
      });
      if (signInError) {
        setError(authErrorMessage(signInError, "E-mail ou senha incorretos."));
        setLoading(false);
        return;
      }
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-white/70 p-6">
      <div className="mb-4 flex rounded-full bg-muted p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`flex-1 rounded-full px-3 py-1.5 ${
            mode === "signin" ? "bg-brand text-brand-foreground" : "text-foreground/70"
          }`}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded-full px-3 py-1.5 ${
            mode === "signup" ? "bg-brand text-brand-foreground" : "text-foreground/70"
          }`}
        >
          Criar conta
        </button>
      </div>

      <div className="space-y-3">
        {mode === "signup" && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
            required
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        )}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@empresa.com"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>

      {mode === "signin" && (
        <p className="mt-2 text-right text-sm">
          <Link href="/forgot-password" className="text-brand hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-5 w-full rounded-full bg-brand px-4 py-2.5 font-medium text-brand-foreground disabled:opacity-60"
      >
        {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
      </button>
    </form>
  );
}
