"use client";

import { useState, useTransition } from "react";
import { WEEKDAYS } from "@/lib/availability";
import { saveWeeklyHoursAction } from "./actions";
import {
  initialScheduleActionState,
  type ScheduleActionState,
  type WeeklyHoursEntry,
} from "./types";

type Entry = { start: string; end: string };

function group(initial: WeeklyHoursEntry[]): Record<number, Entry[]> {
  const map: Record<number, Entry[]> = {};
  for (let day = 0; day < 7; day += 1) map[day] = [];
  for (const entry of initial) {
    (map[entry.weekday] ??= []).push({ start: entry.start, end: entry.end });
  }
  return map;
}

export function WeeklyHoursEditor({
  ownerType,
  ownerId,
  initial,
  canManage,
}: {
  ownerType: "branch" | "professional";
  ownerId: string;
  initial: WeeklyHoursEntry[];
  canManage: boolean;
}) {
  const [days, setDays] = useState<Record<number, Entry[]>>(() => group(initial));
  const [result, setResult] = useState<ScheduleActionState>(
    initialScheduleActionState,
  );
  const [pending, startTransition] = useTransition();

  function addInterval(weekday: number) {
    setDays((prev) => ({
      ...prev,
      [weekday]: [...prev[weekday], { start: "09:00", end: "18:00" }],
    }));
  }

  function removeInterval(weekday: number, index: number) {
    setDays((prev) => ({
      ...prev,
      [weekday]: prev[weekday].filter((_, i) => i !== index),
    }));
  }

  function updateInterval(
    weekday: number,
    index: number,
    field: "start" | "end",
    value: string,
  ) {
    setDays((prev) => ({
      ...prev,
      [weekday]: prev[weekday].map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function save() {
    const intervals: WeeklyHoursEntry[] = [];
    for (let day = 0; day < 7; day += 1) {
      for (const item of days[day]) {
        intervals.push({ weekday: day, start: item.start, end: item.end });
      }
    }
    startTransition(async () => {
      const next = await saveWeeklyHoursAction({ ownerType, ownerId, intervals });
      setResult(next);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white/70 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Horário semanal
        </h2>
        {canManage && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            {pending ? "Salvando..." : "Salvar horários"}
          </button>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {WEEKDAYS.map((label, weekday) => (
          <div key={weekday} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <span className="w-32 shrink-0 pt-1.5 text-sm text-foreground/70">
              {label}
            </span>
            <div className="flex-1 space-y-2">
              {days[weekday].length === 0 && (
                <p className="pt-1.5 text-xs text-foreground/70">Fechado</p>
              )}
              {days[weekday].map((interval, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={interval.start}
                    disabled={!canManage}
                    onChange={(event) =>
                      updateInterval(weekday, index, "start", event.target.value)
                    }
                    className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand disabled:opacity-60"
                  />
                  <span className="text-xs text-foreground/70">até</span>
                  <input
                    type="time"
                    value={interval.end}
                    disabled={!canManage}
                    onChange={(event) =>
                      updateInterval(weekday, index, "end", event.target.value)
                    }
                    className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand disabled:opacity-60"
                  />
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => removeInterval(weekday, index)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Remover
                    </button>
                  )}
                </div>
              ))}
              {canManage && (
                <button
                  type="button"
                  onClick={() => addInterval(weekday)}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  + intervalo
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {result.status === "error" && result.message && (
        <p className="mt-3 text-sm text-red-600">{result.message}</p>
      )}
      {result.status === "success" && result.message && (
        <p className="mt-3 text-sm text-emerald-700">{result.message}</p>
      )}
    </div>
  );
}
