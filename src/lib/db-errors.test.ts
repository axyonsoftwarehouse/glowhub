import { describe, expect, it } from "vitest";
import { dbErrorCode, dbErrorMessage } from "./db-errors";

function drizzleError(cause: { code?: string; message?: string }) {
  return Object.assign(new Error('Failed query: insert into "x"\nparams: '), { cause });
}

describe("dbErrorCode", () => {
  it("lê o código direto do erro do driver", () => {
    expect(dbErrorCode({ code: "42501" })).toBe("42501");
  });

  it("lê o código do erro do driver embrulhado pelo Drizzle (.cause)", () => {
    expect(dbErrorCode(drizzleError({ code: "23505" }))).toBe("23505");
  });

  it("devolve undefined quando não há código", () => {
    expect(dbErrorCode(new Error("x"))).toBeUndefined();
    expect(dbErrorCode(undefined)).toBeUndefined();
    expect(dbErrorCode({ code: 123 })).toBeUndefined();
  });
});

describe("dbErrorMessage", () => {
  it("inclui a mensagem do erro do driver embrulhado pelo Drizzle", () => {
    const message = dbErrorMessage(
      drizzleError({ message: 'duplicate key value violates unique constraint "tenants_slug_key"' }),
    );
    expect(message).toContain("Failed query");
    expect(message).toContain("tenants_slug_key");
  });

  it("usa a mensagem do próprio erro quando não há causa", () => {
    expect(dbErrorMessage(new Error("tenant_read_only"))).toBe("tenant_read_only");
    expect(dbErrorMessage("invitation_expired")).toBe("invitation_expired");
  });
});
