/**
 * Calculo de disponibilidade (wall-clock, sem fuso/DST).
 * Trabalhamos com minutos desde 00:00 e o dia da semana derivado da data
 * (0 = domingo .. 6 = sabado). A logica e pura para ser testavel e reutilizada
 * pela agenda.
 */

export const WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export type TimeInterval = { start: number; end: number };

export type WeeklyHour = {
  weekday: number;
  start: number;
  end: number;
};

export type Closure = {
  startDate: string;
  endDate: string;
  start: number | null;
  end: number | null;
};

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: TimeInterval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function intersectIntervals(
  a: TimeInterval[],
  b: TimeInterval[],
): TimeInterval[] {
  const first = mergeIntervals(a);
  const second = mergeIntervals(b);
  const out: TimeInterval[] = [];
  let i = 0;
  let j = 0;

  while (i < first.length && j < second.length) {
    const start = Math.max(first[i].start, second[j].start);
    const end = Math.min(first[i].end, second[j].end);
    if (start < end) out.push({ start, end });

    if (first[i].end < second[j].end) i += 1;
    else j += 1;
  }

  return out;
}

function subtractIntervals(
  base: TimeInterval[],
  blocks: TimeInterval[],
): TimeInterval[] {
  const merged = mergeIntervals(blocks);
  let result = mergeIntervals(base);

  for (const block of merged) {
    const next: TimeInterval[] = [];
    for (const segment of result) {
      if (block.end <= segment.start || block.start >= segment.end) {
        next.push(segment);
        continue;
      }
      if (block.start > segment.start) {
        next.push({ start: segment.start, end: block.start });
      }
      if (block.end < segment.end) {
        next.push({ start: block.end, end: segment.end });
      }
    }
    result = next;
  }

  return result;
}

export type ComputeSlotsParams = {
  date: string;
  branchHours: WeeklyHour[];
  professionalHours: WeeklyHour[];
  closures: Closure[];
  durationMinutes: number;
  stepMinutes?: number;
  busy?: TimeInterval[];
};

/**
 * Retorna os horarios de inicio disponiveis ("HH:MM") para a data.
 * - Sem horario de profissional, herda o horario da filial.
 * - Com horarios de profissional, usa a interseccao com a filial.
 * - Subtrai bloqueios/feriados e compromissos existentes.
 */
export function computeAvailableSlots(params: ComputeSlotsParams): string[] {
  const step = params.stepMinutes ?? 30;
  const weekday = weekdayOf(params.date);

  const branch: TimeInterval[] = params.branchHours
    .filter((hour) => hour.weekday === weekday)
    .map((hour) => ({ start: hour.start, end: hour.end }));

  let working: TimeInterval[];
  if (params.professionalHours.length > 0) {
    const professional: TimeInterval[] = params.professionalHours
      .filter((hour) => hour.weekday === weekday)
      .map((hour) => ({ start: hour.start, end: hour.end }));
    working = intersectIntervals(branch, professional);
  } else {
    working = mergeIntervals(branch);
  }

  const dayClosures = params.closures.filter(
    (closure) =>
      closure.startDate <= params.date && params.date <= closure.endDate,
  );
  if (dayClosures.some((closure) => closure.start === null)) return [];

  const blocks: TimeInterval[] = [
    ...dayClosures
      .filter(
        (closure): closure is Closure & { start: number; end: number } =>
          closure.start !== null && closure.end !== null,
      )
      .map((closure) => ({ start: closure.start, end: closure.end })),
    ...(params.busy ?? []),
  ];

  working = subtractIntervals(working, blocks);

  const slots: string[] = [];
  for (const interval of working) {
    for (let t = interval.start; t + params.durationMinutes <= interval.end; t += step) {
      slots.push(minutesToTime(t));
    }
  }
  return slots;
}
