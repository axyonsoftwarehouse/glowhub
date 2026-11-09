import { describe, expect, it } from "vitest";
import { checkVoidEligibility } from "./charge-void";

const base = {
  status: "open",
  voidedAt: null,
  payments: [],
  earnings: [],
};

describe("checkVoidEligibility", () => {
  it("permite estornar cobrança aberta sem pagamentos", () => {
    expect(checkVoidEligibility(base)).toEqual({ ok: true });
  });

  it("recusa cobrança já estornada", () => {
    expect(
      checkVoidEligibility({ ...base, status: "void", voidedAt: new Date() }),
    ).toEqual({ ok: false, reason: "Esta cobrança já foi estornada." });
  });

  it("recusa cobrança paga", () => {
    expect(checkVoidEligibility({ ...base, status: "paid" })).toEqual({
      ok: false,
      reason: "Só é possível estornar uma cobrança aberta (não paga).",
    });
  });

  it("recusa pagamento pendente no gateway", () => {
    expect(
      checkVoidEligibility({
        ...base,
        payments: [{ status: "pending" }],
      }),
    ).toEqual({
      ok: false,
      reason: "Há pagamento pendente no gateway. Cancele-o na conciliação antes.",
    });
  });

  it("recusa pagamento confirmado", () => {
    expect(
      checkVoidEligibility({
        ...base,
        payments: [{ status: "confirmed" }],
      }),
    ).toEqual({
      ok: false,
      reason: "Há pagamento confirmado. Estorne o recebimento antes da cobrança.",
    });
  });

  it("recusa comissão já repassada", () => {
    expect(
      checkVoidEligibility({
        ...base,
        earnings: [{ status: "paid" }],
      }),
    ).toEqual({
      ok: false,
      reason: "A comissão já foi repassada ao profissional; não é possível estornar.",
    });
  });

  it("aceita comissão pendente e pagamento falho/estornado", () => {
    expect(
      checkVoidEligibility({
        ...base,
        payments: [{ status: "failed" }, { status: "refunded" }],
        earnings: [{ status: "pending" }],
      }),
    ).toEqual({ ok: true });
  });
});
