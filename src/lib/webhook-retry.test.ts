import { describe, expect, it } from "vitest";
import {
  canRetryWebhook,
  nextWebhookAttemptAt,
  WEBHOOK_MAX_ATTEMPTS,
  webhookRetryDelaySeconds,
} from "./webhook-retry";

describe("webhookRetryDelaySeconds", () => {
  it("não agenda nova tentativa antes da primeira falha", () => {
    expect(webhookRetryDelaySeconds(0)).toBeNull();
  });

  it("cresce com backoff exponencial", () => {
    expect(webhookRetryDelaySeconds(1)).toBe(60);
    expect(webhookRetryDelaySeconds(2)).toBe(300);
    expect(webhookRetryDelaySeconds(3)).toBe(900);
    expect(webhookRetryDelaySeconds(4)).toBe(3_600);
    expect(webhookRetryDelaySeconds(5)).toBe(21_600);
  });

  it("para no limite de tentativas", () => {
    expect(webhookRetryDelaySeconds(WEBHOOK_MAX_ATTEMPTS)).toBeNull();
    expect(webhookRetryDelaySeconds(WEBHOOK_MAX_ATTEMPTS + 1)).toBeNull();
  });
});

describe("nextWebhookAttemptAt", () => {
  it("calcula a data da próxima tentativa", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(nextWebhookAttemptAt(1, now)?.toISOString()).toBe(
      "2026-01-01T00:01:00.000Z",
    );
  });

  it("retorna null quando esgotou", () => {
    expect(nextWebhookAttemptAt(WEBHOOK_MAX_ATTEMPTS)).toBeNull();
  });
});

describe("canRetryWebhook", () => {
  it("não repete evento já processado", () => {
    expect(canRetryWebhook("processed", 1)).toBe(false);
  });

  it("repete pendente/falho enquanto houver tentativas", () => {
    expect(canRetryWebhook("pending", 0)).toBe(true);
    expect(canRetryWebhook("failed", WEBHOOK_MAX_ATTEMPTS - 1)).toBe(true);
    expect(canRetryWebhook("failed", WEBHOOK_MAX_ATTEMPTS)).toBe(false);
  });
});
