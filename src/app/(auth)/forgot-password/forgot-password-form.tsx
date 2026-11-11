"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { inputClass, primaryButtonClass } from "../auth-card";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: requestError } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setLoading(false);

    if (requestError) {
      setError(authErrorMessage(requestError, "Não foi possível enviar o link."));
      return;
    }
    // Mesma resposta exista ou nao a conta: nao revela quais e-mails estao cadastrados.
    setSent(true);
  }

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-border bg-white/70 p-6 text-sm"
      >
        <p className="font-medium">Verifique sua caixa de entrada.</p>
        <p className="mt-2 text-foreground/70">
          Se existir uma conta com <strong>{email}</strong>, você vai receber um
          link para criar uma nova senha. O link vale por 1 hora. Confira também
          a pasta de spam.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-white/70 p-6"
    >
      <label htmlFor="email" className="mb-1 block text-sm font-medium">
        E-mail
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="voce@empresa.com"
        className={inputClass}
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={loading} className={primaryButtonClass}>
        {loading ? "Enviando..." : "Enviar link"}
      </button>
    </form>
  );
}
