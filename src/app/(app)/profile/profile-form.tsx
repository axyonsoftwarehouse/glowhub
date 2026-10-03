"use client";

import { useState, useTransition } from "react";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { updateProfileAction } from "./actions";
import {
  initialProfileActionState,
  type Profile,
  type ProfileActionState,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [result, setResult] = useState<ProfileActionState>(
    initialProfileActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await updateProfileAction(initialProfileActionState, formData);
      setResult(next);
    });
  }

  const fullNameError = result.fieldErrors?.fullName?.[0];
  const avatarUrlError = result.fieldErrors?.avatarUrl?.[0];
  const timezoneError = result.fieldErrors?.timezone?.[0];

  return (
    <form
      action={handleSubmit}
      className="space-y-4 rounded-2xl border border-border bg-white/70 p-5"
    >
      <div>
        <label className="text-xs font-medium text-foreground/60" htmlFor="fullName">
          Nome
        </label>
        <input
          id="fullName"
          name="fullName"
          defaultValue={profile.fullName ?? ""}
          placeholder="Seu nome"
          className={`mt-1 ${inputClass}`}
        />
        {fullNameError && (
          <p className="mt-1 text-xs text-red-600">{fullNameError}</p>
        )}
      </div>

      <div>
        <label
          className="text-xs font-medium text-foreground/60"
          htmlFor="avatarUrl"
        >
          Foto (URL)
        </label>
        <input
          id="avatarUrl"
          name="avatarUrl"
          defaultValue={profile.avatarUrl ?? ""}
          placeholder="https://..."
          className={`mt-1 ${inputClass}`}
        />
        {avatarUrlError && (
          <p className="mt-1 text-xs text-red-600">{avatarUrlError}</p>
        )}
      </div>

      <div>
        <label
          className="text-xs font-medium text-foreground/60"
          htmlFor="timezone"
        >
          Fuso horário preferido
        </label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={profile.timezone}
          className={`mt-1 ${inputClass}`}
        >
          {TIMEZONE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {timezoneError && (
          <p className="mt-1 text-xs text-red-600">{timezoneError}</p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="emailNotifications"
          defaultChecked={profile.emailNotifications}
          className="h-4 w-4 rounded border-border"
        />
        Receber notificações por e-mail
      </label>

      {result.status === "error" && result.message && (
        <p className="text-sm text-red-600">{result.message}</p>
      )}
      {result.status === "success" && result.message && (
        <p className="text-sm text-emerald-700">{result.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
