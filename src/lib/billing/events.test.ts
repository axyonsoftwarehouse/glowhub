import { describe, expect, it } from "vitest";
import { addMonth, applyEvent, type StoredSubscription } from "./events";

const PAID = new Date("2026-11-11T12:00:00Z");

function sub(partial: Partial<StoredSubscription>): StoredSubscription {
  return {
    plan: null,
    status: "trialing",
    currentPeriodEnd: null,
    providerSubscriptionId: null,
    pendingPlan: null,
    pendingProviderSubscriptionId: null,
    ...partial,
  };
}

const payment = (id: string, status: "approved" | "rejected" | "refunded" = "approved", paidAt = PAID) =>
  ({
    kind: "payment",
    providerSubscriptionId: id,
    providerPaymentId: `pay-${id}`,
    status,
    amountCents: 5990,
    paidAt,
  }) as const;

describe("addMonth", () => {
  it("soma um mês e respeita o fim do mês", () => {
    expect(addMonth(new Date("2026-11-11T12:00:00Z")).toISOString()).toBe("2026-12-11T12:00:00.000Z");
    expect(addMonth(new Date("2027-01-31T12:00:00Z")).toISOString()).toBe("2027-02-28T12:00:00.000Z");
  });
});

describe("applyEvent", () => {
  it("primeiro pagamento do checkout ativa o plano por um mês", () => {
    const out = applyEvent(sub({ pendingPlan: "solo", pendingProviderSubscriptionId: "A" }), payment("A"));
    expect(out.patch).toMatchObject({
      plan: "solo",
      status: "active",
      providerSubscriptionId: "A",
      pendingPlan: null,
      pendingProviderSubscriptionId: null,
    });
    expect(out.patch.currentPeriodEnd?.toISOString()).toBe("2026-12-11T12:00:00.000Z");
    expect(out.paymentPlan).toBe("solo");
    expect(out.cancelProviderSubscriptionId).toBeNull();
  });

  it("troca de plano cancela a assinatura antiga no provedor", () => {
    const out = applyEvent(
      sub({ status: "active", plan: "solo", providerSubscriptionId: "A", pendingPlan: "equipe", pendingProviderSubscriptionId: "B" }),
      payment("B"),
    );
    expect(out.patch.plan).toBe("equipe");
    expect(out.cancelProviderSubscriptionId).toBe("A");
  });

  it("renovação adiantada soma a partir do vencimento", () => {
    const end = new Date("2026-11-15T12:00:00Z");
    const out = applyEvent(sub({ status: "active", plan: "solo", providerSubscriptionId: "A", currentPeriodEnd: end }), payment("A"));
    expect(out.patch.currentPeriodEnd?.toISOString()).toBe("2026-12-15T12:00:00.000Z");
  });

  it("renovação atrasada soma a partir do pagamento e reativa", () => {
    const end = new Date("2026-11-01T12:00:00Z");
    const out = applyEvent(sub({ status: "past_due", plan: "solo", providerSubscriptionId: "A", currentPeriodEnd: end }), payment("A"));
    expect(out.patch).toMatchObject({ status: "active" });
    expect(out.patch.currentPeriodEnd?.toISOString()).toBe("2026-12-11T12:00:00.000Z");
  });

  it("pagamento recusado da assinatura vigente marca pendência", () => {
    const out = applyEvent(sub({ status: "active", plan: "solo", providerSubscriptionId: "A" }), payment("A", "rejected"));
    expect(out.patch).toEqual({ status: "past_due" });
  });

  it("pagamento recusado no checkout não muda a assinatura", () => {
    const out = applyEvent(sub({ pendingPlan: "solo", pendingProviderSubscriptionId: "A" }), payment("A", "rejected"));
    expect(out.patch).toEqual({});
  });

  it("cancelamento: vigente vira cancelada; checkout pendente é descartado", () => {
    expect(
      applyEvent(sub({ status: "active", providerSubscriptionId: "A" }), {
        kind: "subscription",
        providerSubscriptionId: "A",
        status: "cancelled",
      }).patch,
    ).toMatchObject({ status: "canceled" });
    expect(
      applyEvent(sub({ pendingProviderSubscriptionId: "B", pendingPlan: "rede" }), {
        kind: "subscription",
        providerSubscriptionId: "B",
        status: "cancelled",
      }).patch,
    ).toEqual({ pendingPlan: null, pendingProviderSubscriptionId: null });
  });

  it("ignora eventos de outra assinatura", () => {
    expect(applyEvent(sub({ providerSubscriptionId: "A" }), payment("Z")).patch).toEqual({});
  });
});
