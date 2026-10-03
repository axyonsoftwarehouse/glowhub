"use client";

import { useState, useTransition } from "react";
import { createChargeAction } from "@/app/(app)/finance/actions";
import { formatCentsBRL } from "@/lib/money";
import { setAppointmentStatusAction } from "./actions";
import {
  ALLOWED_TRANSITIONS,
  initialAppointmentActionState,
  STATUS_LABELS,
  type Appointment,
  type AppointmentActionState,
  type AppointmentStatus,
} from "./types";

const ACTION_LABELS: Record<AppointmentStatus, string> = {
  pending: "Reabrir",
  confirmed: "Confirmar",
  check_in: "Check-in",
  checkout: "Checkout",
  completed: "Concluir",
  cancelled: "Cancelar",
  no_show: "Não compareceu",
};

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  check_in: "bg-indigo-100 text-indigo-700",
  checkout: "bg-purple-100 text-purple-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-zinc-100 text-zinc-600",
  no_show: "bg-red-100 text-red-700",
};

export function AppointmentRow({
  appointment,
  timeLabel,
  chargeStatus,
}: {
  appointment: Appointment;
  timeLabel: string;
  chargeStatus: "none" | "open" | "paid" | "void";
}) {
  const [result, setResult] = useState<AppointmentActionState>(
    initialAppointmentActionState,
  );
  const [pending, startTransition] = useTransition();

  function change(status: AppointmentStatus) {
    const formData = new FormData();
    formData.set("id", appointment.id);
    formData.set("status", status);
    startTransition(async () => {
      const next = await setAppointmentStatusAction(
        initialAppointmentActionState,
        formData,
      );
      setResult(next);
    });
  }

  function charge() {
    startTransition(async () => {
      setResult(await createChargeAction(appointment.id));
    });
  }

  const canCharge =
    chargeStatus === "none" &&
    appointment.status !== "cancelled" &&
    appointment.status !== "no_show";

  const nextStatuses = ALLOWED_TRANSITIONS[appointment.status];

  return (
    <article className="rounded-xl border border-border bg-white/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {timeLabel} · {appointment.clientName}
          </p>
          <p className="mt-0.5 text-xs text-foreground/50">
            {appointment.serviceName} · {appointment.professionalName}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLES[appointment.status]}`}
        >
          {STATUS_LABELS[appointment.status]}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-sm font-medium text-brand">
          {formatCentsBRL(appointment.priceCents)}
        </span>
        {chargeStatus === "open" && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
            Cobrança aberta
          </span>
        )}
        {chargeStatus === "paid" && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">
            Pago
          </span>
        )}
        {canCharge && (
          <button
            type="button"
            onClick={charge}
            disabled={pending}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
          >
            Cobrar
          </button>
        )}
      </div>

      {nextStatuses.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {nextStatuses.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => change(status)}
              disabled={pending}
              className={`rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-60 ${
                status === "cancelled" || status === "no_show"
                  ? "border-border text-red-600 hover:bg-muted"
                  : "border-border hover:bg-muted"
              }`}
            >
              {ACTION_LABELS[status]}
            </button>
          ))}
        </div>
      )}

      {result.status === "error" && result.message && (
        <p className="mt-2 text-xs text-red-600">{result.message}</p>
      )}
    </article>
  );
}
