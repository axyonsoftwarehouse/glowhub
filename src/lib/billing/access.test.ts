import { describe, expect, it } from "vitest";
import { computeAccess, effectiveLimits, type SubscriptionSnapshot } from "./access";
import { PLANS, TRIAL_LIMITS, canAdd, exceededLimits } from "./plans";

const NOW = new Date("2026-11-11T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

function sub(partial: Partial<SubscriptionSnapshot>): SubscriptionSnapshot {
  return { plan: null, status: "trialing", trialEndsAt: null, currentPeriodEnd: null, ...partial };
}

describe("computeAccess", () => {
  it("cortesia é sempre liberada", () => {
    expect(computeAccess(sub({ status: "comp" }), NOW).level).toBe("ok");
  });

  it("teste: liberado, aviso nos últimos 3 dias e bloqueio ao terminar", () => {
    expect(computeAccess(sub({ trialEndsAt: days(10) }), NOW).level).toBe("ok");
    const warning = computeAccess(sub({ trialEndsAt: days(2) }), NOW);
    expect(warning.level).toBe("warning");
    expect(warning.message).toContain("2 dias");
    expect(computeAccess(sub({ trialEndsAt: days(-1) }), NOW).level).toBe("blocked");
    expect(computeAccess(sub({ trialEndsAt: null }), NOW).level).toBe("blocked");
  });

  it("ativa: liberada até o vencimento, tolerância de 7 dias e depois bloqueio", () => {
    expect(computeAccess(sub({ status: "active", plan: "solo", currentPeriodEnd: days(5) }), NOW).level).toBe("ok");
    expect(computeAccess(sub({ status: "active", plan: "solo", currentPeriodEnd: days(-3) }), NOW).level).toBe("warning");
    expect(computeAccess(sub({ status: "active", plan: "solo", currentPeriodEnd: days(-8) }), NOW).level).toBe("blocked");
  });

  it("pagamento recusado avisa mesmo antes do vencimento", () => {
    const access = computeAccess(sub({ status: "past_due", plan: "solo", currentPeriodEnd: days(5) }), NOW);
    expect(access.level).toBe("warning");
    expect(computeAccess(sub({ status: "past_due", plan: "solo", currentPeriodEnd: days(-8) }), NOW).level).toBe("blocked");
  });

  it("cancelada: acesso até o fim do período pago", () => {
    expect(computeAccess(sub({ status: "canceled", currentPeriodEnd: days(4) }), NOW).level).toBe("warning");
    expect(computeAccess(sub({ status: "canceled", currentPeriodEnd: days(-1) }), NOW).level).toBe("blocked");
    expect(computeAccess(sub({ status: "canceled", currentPeriodEnd: null }), NOW).level).toBe("blocked");
  });
});

describe("limites", () => {
  it("teste e cortesia usam os limites do maior plano", () => {
    expect(effectiveLimits(sub({ trialEndsAt: days(3) }))).toEqual(TRIAL_LIMITS);
    expect(effectiveLimits(sub({ status: "comp" }))).toEqual(TRIAL_LIMITS);
  });

  it("assinatura paga usa os limites do plano", () => {
    expect(effectiveLimits(sub({ status: "active", plan: "solo" }))).toEqual(PLANS.solo.limits);
  });

  it("canAdd respeita o máximo e o ilimitado", () => {
    const usage = { professionals: 1, branches: 1, members: 2 };
    expect(canAdd(PLANS.solo.limits, usage, "professionals")).toBe(false);
    expect(canAdd(PLANS.equipe.limits, usage, "professionals")).toBe(true);
    expect(canAdd(PLANS.rede.limits, { ...usage, members: 999 }, "members")).toBe(true);
  });

  it("exceededLimits aponta o que não cabe no plano", () => {
    expect(
      exceededLimits(PLANS.solo.limits, { professionals: 3, branches: 1, members: 2 }),
    ).toEqual(["professionals"]);
    expect(exceededLimits(PLANS.rede.limits, { professionals: 50, branches: 2, members: 30 })).toEqual([]);
  });
});
