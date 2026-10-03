import { describe, expect, it } from "vitest";
import {
  computeAvailableSlots,
  timeToMinutes,
  weekdayOf,
  type Closure,
  type WeeklyHour,
} from "./availability";

// 2026-01-05 é uma segunda-feira (weekday = 1).
const MONDAY = "2026-01-05";

function hour(weekday: number, start: string, end: string): WeeklyHour {
  return { weekday, start: timeToMinutes(start), end: timeToMinutes(end) };
}

describe("weekdayOf", () => {
  it("deriva o dia da semana em UTC", () => {
    expect(weekdayOf(MONDAY)).toBe(1);
    expect(weekdayOf("2026-01-04")).toBe(0); // domingo
  });
});

describe("computeAvailableSlots", () => {
  const branchMonday = [hour(1, "09:00", "18:00")];

  it("gera slots de hora em hora dentro do horário da filial", () => {
    const slots = computeAvailableSlots({
      date: MONDAY,
      branchHours: branchMonday,
      professionalHours: [],
      closures: [],
      durationMinutes: 60,
      stepMinutes: 60,
    });
    expect(slots[0]).toBe("09:00");
    expect(slots.at(-1)).toBe("17:00");
    expect(slots).toHaveLength(9);
  });

  it("herda o horário da filial quando o profissional não tem horário", () => {
    const withBranch = computeAvailableSlots({
      date: MONDAY,
      branchHours: branchMonday,
      professionalHours: [],
      closures: [],
      durationMinutes: 60,
      stepMinutes: 60,
    });
    const inherited = computeAvailableSlots({
      date: MONDAY,
      branchHours: branchMonday,
      professionalHours: branchMonday,
      closures: [],
      durationMinutes: 60,
      stepMinutes: 60,
    });
    expect(inherited).toEqual(withBranch);
  });

  it("usa a interseção entre filial e profissional", () => {
    const slots = computeAvailableSlots({
      date: MONDAY,
      branchHours: branchMonday,
      professionalHours: [hour(1, "10:00", "12:00")],
      closures: [],
      durationMinutes: 60,
      stepMinutes: 30,
    });
    expect(slots).toEqual(["10:00", "10:30", "11:00"]);
  });

  it("retorna vazio quando o dia está fechado", () => {
    const slots = computeAvailableSlots({
      date: MONDAY,
      branchHours: [],
      professionalHours: [],
      closures: [],
      durationMinutes: 30,
    });
    expect(slots).toEqual([]);
  });

  it("respeita bloqueio de dia inteiro", () => {
    const closures: Closure[] = [
      { startDate: MONDAY, endDate: MONDAY, start: null, end: null },
    ];
    const slots = computeAvailableSlots({
      date: MONDAY,
      branchHours: branchMonday,
      professionalHours: [],
      closures,
      durationMinutes: 30,
    });
    expect(slots).toEqual([]);
  });

  it("remove slots que colidem com bloqueio por horário", () => {
    const closures: Closure[] = [
      {
        startDate: MONDAY,
        endDate: MONDAY,
        start: timeToMinutes("12:00"),
        end: timeToMinutes("13:00"),
      },
    ];
    const slots = computeAvailableSlots({
      date: MONDAY,
      branchHours: branchMonday,
      professionalHours: [],
      closures,
      durationMinutes: 60,
      stepMinutes: 60,
    });
    expect(slots).not.toContain("12:00");
    expect(slots).toContain("11:00"); // 11:00-12:00 encosta no bloqueio, não colide
    expect(slots).toContain("10:00");
    expect(slots).toContain("13:00");
  });

  it("remove slots que colidem com compromissos (busy)", () => {
    const slots = computeAvailableSlots({
      date: MONDAY,
      branchHours: branchMonday,
      professionalHours: [],
      closures: [],
      durationMinutes: 30,
      stepMinutes: 30,
      busy: [
        { start: timeToMinutes("10:00"), end: timeToMinutes("11:00") },
      ],
    });
    expect(slots).not.toContain("10:00");
    expect(slots).not.toContain("10:30");
    expect(slots).toContain("11:00");
  });
});
