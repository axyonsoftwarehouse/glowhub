"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { inputClass, primaryButtonClass } from "../auth-card";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }

    setLoading(true);
    const { error: resetError } = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setLoading(false);

    if (resetError) {
      setError(authErrorMessage(resetError, "Não foi possível salvar a nova senha."));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-border bg-white/70 p-6 text-sm"
      >
        <p className="font-medium">Senha alterada.</p>
        <p className="mt-2 text-foreground/70">
          Entre com seu e-mail e a nova senha.
        </p>
        <Link
          href="/login"
          className="mt-5 block w-full rounded-full bg-brand px-4 py-2.5 text-center font-medium text-brand-foreground"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-white/70 p-6"
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Nova senha
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-foreground/60">Mínimo de 8 caracteres.</p>
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1 block text-sm font-medium">
            Repita a nova senha
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}{" "}
          {error.includes("link") && (
            <Link href="/forgot-password" className="underline">
              Pedir novo link
            </Link>
          )}
        </p>
      )}
      <button type="submit" disabled={loading} className={primaryButtonClass}>
        {loading ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
