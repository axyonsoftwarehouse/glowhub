import { describe, expect, it } from "vitest";
import {
  formatReminderWhen,
  reminderDedupeKey,
  reminderScheduledFor,
  REMINDER_LEAD_HOURS,
} from "./reminders";

describe("reminderScheduledFor", () => {
  it("agenda 24h antes do atendimento", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const startsAt = new Date("2026-01-03T15:00:00.000Z");
    expect(reminderScheduledFor(startsAt, now).toISOString()).toBe(
      "2026-01-02T15:00:00.000Z",
    );
    expect(REMINDER_LEAD_HOURS).toBe(24);
  });

  it("agenda para agora quando o atendimento é em menos de 24h", () => {
    const now = new Date("2026-01-01T10:00:00.000Z");
    const startsAt = new Date("2026-01-01T15:00:00.000Z");
    expect(reminderScheduledFor(startsAt, now).toISOString()).toBe(
      "2026-01-01T10:00:00.000Z",
    );
  });
});

describe("reminderDedupeKey", () => {
  it("é estável por agendamento", () => {
    expect(reminderDedupeKey("abc")).toBe("appointment-reminder-abc");
  });
});

describe("formatReminderWhen", () => {
  it("formata no fuso da filial", () => {
    const value = formatReminderWhen(
      new Date("2026-01-02T15:00:00.000Z"),
      "America/Sao_Paulo",
    );
    expect(value).toContain("12:00");
  });
});
