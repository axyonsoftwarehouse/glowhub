import { describe, expect, it } from "vitest";
import {
  formatInTimeZone,
  todayInTimeZone,
  zonedDateKey,
  zonedMinutesOfDay,
  zonedTimeToUtc,
} from "./timezone";

// America/Sao_Paulo é UTC-3 (sem horário de verão desde 2019).

describe("zonedTimeToUtc", () => {
  it("converte hora local para UTC", () => {
    const date = zonedTimeToUtc("2026-01-05", "09:00", "America/Sao_Paulo");
    expect(date.toISOString()).toBe("2026-01-05T12:00:00.000Z");
  });

  it("trata a meia-noite local", () => {
    const date = zonedTimeToUtc("2026-01-05", "00:00", "America/Sao_Paulo");
    expect(date.toISOString()).toBe("2026-01-05T03:00:00.000Z");
  });
});

describe("formatação no fuso", () => {
  it("formatInTimeZone devolve HH:MM", () => {
    expect(
      formatInTimeZone("2026-01-05T12:00:00.000Z", "America/Sao_Paulo"),
    ).toBe("09:00");
  });

  it("zonedMinutesOfDay devolve minutos desde 00:00", () => {
    expect(
      zonedMinutesOfDay("2026-01-05T12:00:00.000Z", "America/Sao_Paulo"),
    ).toBe(540);
  });

  it("zonedDateKey considera o dia local", () => {
    expect(
      zonedDateKey("2026-01-05T02:00:00.000Z", "America/Sao_Paulo"),
    ).toBe("2026-01-04");
  });
});

describe("todayInTimeZone", () => {
  it("às 23h em São Paulo ainda é o mesmo dia (UTC já virou)", () => {
    const now = new Date("2026-11-12T02:00:00.000Z"); // 23:00 de 11/11 em SP
    expect(todayInTimeZone("America/Sao_Paulo", now)).toBe("2026-11-11");
  });

  it("usa São Paulo como fuso padrão", () => {
    const now = new Date("2026-11-12T02:30:00.000Z");
    expect(todayInTimeZone(undefined, now)).toBe("2026-11-11");
  });
});
