"use client";

import { useState, useTransition } from "react";
import { processNotificationsAction } from "./actions";
import {
  initialNotificationActionState,
  type NotificationActionState,
} from "./types";

export function ProcessNotificationsButton({ disabled }: { disabled?: boolean }) {
  const [result, setResult] = useState<NotificationActionState>(
    initialNotificationActionState,
  );
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      setResult(await processNotificationsAction());
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending || disabled}
        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Enviando..." : "Enviar pendentes"}
      </button>
      {result.status === "error" && result.message && (
        <span className="text-xs text-red-600">{result.message}</span>
      )}
      {result.status === "success" && result.message && (
        <span className="text-xs text-emerald-700">{result.message}</span>
      )}
    </div>
  );
}
