import { describe, expect, it } from "vitest";
import { OVERLAP_MESSAGE, dbErrorCode, overlapMessage } from "./appointment-errors";

describe("overlapMessage", () => {
  it("traduz a violação da trava de agendamento (23P01)", () => {
    expect(overlapMessage({ code: "23P01" })).toBe(OVERLAP_MESSAGE);
    expect(OVERLAP_MESSAGE).toBe(
      "Já existe um agendamento nesse horário para o profissional.",
    );
  });

  it("lê o código do erro do driver embrulhado pelo Drizzle (.cause)", () => {
    const wrapped = Object.assign(new Error("Failed query"), {
      cause: { code: "23P01" },
    });
    expect(overlapMessage(wrapped)).toBe(OVERLAP_MESSAGE);
    expect(dbErrorCode(wrapped)).toBe("23P01");
    expect(dbErrorCode({ code: "42501" })).toBe("42501");
  });

  it("ignora outros erros", () => {
    expect(overlapMessage({ code: "42501" })).toBeNull();
    expect(overlapMessage(new Error("x"))).toBeNull();
    expect(overlapMessage(undefined)).toBeNull();
  });
});
