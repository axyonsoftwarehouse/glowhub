import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMetricsSnapshot, recordMetric, resetMetrics } from "./metrics";

describe("metrics", () => {
  beforeEach(() => {
    resetMetrics();
    delete process.env.METRICS_WEBHOOK_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.METRICS_WEBHOOK_URL;
  });

  it("acumula valores por nome e tags", () => {
    recordMetric("booking_created");
    recordMetric("booking_created");
    recordMetric("payment_failed", 2, { method: "pix" });

    expect(getMetricsSnapshot()).toContainEqual({
      name: "booking_created",
      value: 2,
      tags: {},
    });
    expect(getMetricsSnapshot()).toContainEqual({
      name: "payment_failed",
      value: 2,
      tags: { method: "pix" },
    });
  });

  it("separa contadores por tags", () => {
    recordMetric("webhook_event", 1, { provider: "stripe" });
    recordMetric("webhook_event", 1, { provider: "pagarme" });

    const values = getMetricsSnapshot()
      .filter((point) => point.name === "webhook_event")
      .map((point) => point.value);
    expect(values).toEqual([1, 1]);
  });

  it("nao envia ao coletor quando METRICS_WEBHOOK_URL nao esta definido", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    recordMetric("x");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("envia best-effort ao coletor quando configurado", async () => {
    process.env.METRICS_WEBHOOK_URL = "https://metrics.example/ingest";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));

    recordMetric("x", 1, { tenant: "demo" });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://metrics.example/ingest");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      name: "x",
      value: 1,
      tags: { tenant: "demo" },
    });
  });

  it("engole falha do coletor", async () => {
    process.env.METRICS_WEBHOOK_URL = "https://metrics.example/ingest";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("down"));

    expect(() => recordMetric("x")).not.toThrow();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  });
});
