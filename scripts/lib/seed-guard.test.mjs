import { describe, expect, it } from "vitest";
import { assertSeedAllowed } from "./seed-guard.mjs";

describe("assertSeedAllowed", () => {
  it("roda livre em dev", () => {
    expect(() => assertSeedAllowed("dev", [])).not.toThrow();
  });

  it("exige --confirm-demo em demo", () => {
    expect(() => assertSeedAllowed("demo", [])).toThrow(/--confirm-demo/);
    expect(() => assertSeedAllowed("demo", ["--confirm-demo"])).not.toThrow();
  });

  it("recusa sem APP_ENV ou em production, mesmo com a flag", () => {
    expect(() => assertSeedAllowed(undefined, ["--confirm-demo"])).toThrow();
    expect(() => assertSeedAllowed("production", ["--confirm-demo"])).toThrow();
  });
});
