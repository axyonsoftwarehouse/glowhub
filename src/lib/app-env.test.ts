import { describe, expect, it } from "vitest";
import { getAppEnv, isDemoLoginEnabled } from "./app-env";

describe("getAppEnv", () => {
  it("assume production quando APP_ENV está ausente", () => {
    expect(getAppEnv({})).toBe("production");
  });

  it("aceita os valores exatos demo, dev e production", () => {
    expect(getAppEnv({ APP_ENV: "demo" })).toBe("demo");
    expect(getAppEnv({ APP_ENV: "dev" })).toBe("dev");
    expect(getAppEnv({ APP_ENV: "production" })).toBe("production");
  });

  it("trata valores desconhecidos ou fora do padrão como production", () => {
    expect(getAppEnv({ APP_ENV: "DEV" })).toBe("production");
    expect(getAppEnv({ APP_ENV: "staging" })).toBe("production");
  });
});

describe("isDemoLoginEnabled", () => {
  const enabled = {
    APP_ENV: "demo",
    NEXT_PUBLIC_DEMO_LOGIN: "true",
    DEMO_PASSWORD: "x",
  };

  it("liga em demo e dev com flag e senha", () => {
    expect(isDemoLoginEnabled(enabled)).toBe(true);
    expect(isDemoLoginEnabled({ ...enabled, APP_ENV: "dev" })).toBe(true);
  });

  it("desliga em production ou sem APP_ENV", () => {
    expect(isDemoLoginEnabled({ ...enabled, APP_ENV: "production" })).toBe(false);
    expect(isDemoLoginEnabled({ ...enabled, APP_ENV: undefined })).toBe(false);
  });

  it("desliga sem senha ou sem a flag", () => {
    expect(isDemoLoginEnabled({ ...enabled, DEMO_PASSWORD: "" })).toBe(false);
    expect(isDemoLoginEnabled({ ...enabled, NEXT_PUBLIC_DEMO_LOGIN: "false" })).toBe(false);
  });
});
