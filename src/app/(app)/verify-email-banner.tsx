"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setState("sending");
    setError(null);
    const { error: sendError } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/verify-email",
    });
    if (sendError) {
      setError(authErrorMessage(sendError, "Não foi possível reenviar o link."));
      setState("idle");
      return;
    }
    setState("sent");
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      <p className="flex-1">
        Confirme seu e-mail <strong>{email}</strong> pelo link que enviamos para
        proteger sua conta.
      </p>
      {state === "sent" ? (
        <p role="status" className="font-medium">
          Link reenviado. Confira sua caixa de entrada.
        </p>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={state === "sending"}
          className="rounded-full border border-sky-400 bg-white px-3 py-1 font-medium hover:bg-sky-100 disabled:opacity-60"
        >
          {state === "sending" ? "Enviando..." : "Reenviar link"}
        </button>
      )}
      {error && (
        <p role="alert" className="w-full text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
