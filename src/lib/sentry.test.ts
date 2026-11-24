import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import {
  REDACTED,
  parseSampleRate,
  scrubData,
  scrubEvent,
  sentryEnvironment,
  sentryOptions,
} from "./sentry";

describe("parseSampleRate", () => {
  it("aceita valores entre 0 e 1", () => {
    expect(parseSampleRate("0.2")).toBe(0.2);
    expect(parseSampleRate("1")).toBe(1);
  });

  it("cai para 0 quando ausente ou invalido", () => {
    expect(parseSampleRate(undefined)).toBe(0);
    expect(parseSampleRate("abc")).toBe(0);
    expect(parseSampleRate("2")).toBe(0);
    expect(parseSampleRate("-1")).toBe(0);
  });
});

describe("sentryEnvironment", () => {
  it("prefere NEXT_PUBLIC_SENTRY_ENVIRONMENT, depois APP_ENV", () => {
    expect(sentryEnvironment({ NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging", APP_ENV: "dev" })).toBe("staging");
    expect(sentryEnvironment({ APP_ENV: "demo" })).toBe("demo");
    expect(sentryEnvironment({})).toBe("production");
  });
});

describe("sentryOptions", () => {
  it("fica desligado sem DSN", () => {
    expect(sentryOptions({}).enabled).toBe(false);
  });

  it("liga com DSN e desliga a coleta automatica de dados pessoais", () => {
    const options = sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: "https://k@o.ingest.sentry.io/1" });
    expect(options.enabled).toBe(true);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    });
  });
});

describe("scrubData", () => {
  it("mascara chaves sensiveis em qualquer nivel", () => {
    const result = scrubData({
      tenantId: "t1",
      email: "ana@example.com",
      nested: { apiKey: "abc", items: [{ password: "x", ok: 1 }] },
    });
    expect(result).toEqual({
      tenantId: "t1",
      email: REDACTED,
      nested: { apiKey: REDACTED, items: [{ password: REDACTED, ok: 1 }] },
    });
  });
});

describe("scrubEvent", () => {
  it("remove cookies, corpo, query string e dados do usuario alem do id", () => {
    const event = {
      type: undefined,
      request: {
        url: "https://app.test/clients?q=ana",
        query_string: "q=ana",
        cookies: { session: "s" },
        data: { name: "Ana" },
        headers: { authorization: "Bearer x", "user-agent": "UA" },
      },
      user: { id: "u1", email: "ana@example.com", ip_address: "1.2.3.4" },
      extra: { token: "t", kind: "verify" },
    } as ErrorEvent;

    const result = scrubEvent(event);

    expect(result.request?.url).toBe("https://app.test/clients");
    expect(result.request?.query_string).toBe(REDACTED);
    expect(result.request?.cookies).toBeUndefined();
    expect(result.request?.data).toBeUndefined();
    expect(result.request?.headers).toEqual({ authorization: REDACTED, "user-agent": "UA" });
    expect(result.user).toEqual({ id: "u1" });
    expect(result.extra).toEqual({ token: REDACTED, kind: "verify" });
  });

  it("tira a query string do caminho registrado pelo SDK do Next", () => {
    const event = {
      type: undefined,
      contexts: {
        nextjs: { request_path: "/api/x?tipo=throw&email=ana%40exemplo.com", route_type: "route" },
      },
    } as unknown as ErrorEvent;

    const result = scrubEvent(event);

    expect(result.contexts?.nextjs).toEqual({ request_path: "/api/x", route_type: "route" });
  });
});
