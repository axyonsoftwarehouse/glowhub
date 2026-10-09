import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAlerts, sendAlert } from "./alerts";

describe("alerts", () => {
  beforeEach(() => {
    resetAlerts();
    delete process.env.ALERT_WEBHOOK_URL;
    delete process.env.ALERT_MIN_LEVEL;
    delete process.env.ALERT_COOLDOWN_SECONDS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ALERT_WEBHOOK_URL;
    delete process.env.ALERT_MIN_LEVEL;
    delete process.env.ALERT_COOLDOWN_SECONDS;
  });

  it("nao envia sem ALERT_WEBHOOK_URL", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    sendAlert({ level: "critical", title: "boom" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("nao envia warn por padrao (minimo error)", () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example/x";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    sendAlert({ level: "warn", title: "w" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("envia a partir do nivel minimo configurado", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example/x";
    process.env.ALERT_MIN_LEVEL = "warn";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    sendAlert({ level: "warn", title: "w", context: { id: 1 } });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toMatchObject({
      level: "warn",
      title: "w",
      context: { id: 1 },
    });
  });

  it("suprime alertas repetidos dentro do cooldown", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example/x";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    sendAlert({ level: "error", title: "same" });
    sendAlert({ level: "error", title: "same" });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("permite repetir quando o cooldown e zero", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example/x";
    process.env.ALERT_COOLDOWN_SECONDS = "0";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    sendAlert({ level: "error", title: "same" });
    sendAlert({ level: "error", title: "same" });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
