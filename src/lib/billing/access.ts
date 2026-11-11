import { GRACE_DAYS, PLANS, TRIAL_LIMITS, isPlanId, type PlanLimits } from "./plans";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "comp";

export type SubscriptionSnapshot = {
  plan: string | null;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
};

export type AccessLevel = "ok" | "warning" | "blocked";

export type Access = {
  level: AccessLevel;
  /** Mensagem curta para o aviso/bloqueio (pt-BR). */
  message: string | null;
  /** Data relevante: fim do teste, vencimento ou fim do acesso. */
  until: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/**
 * Regra de acesso ao painel a partir do estado da assinatura. Pura (sem banco),
 * para ser testada e reaproveitada no layout, na pagina de cobranca e na API.
 *
 * - cortesia (demo): sempre liberado;
 * - teste: liberado ate o fim; aviso nos ultimos 3 dias; depois bloqueia;
 * - ativa/pendente: liberado ate o vencimento; depois aviso por GRACE_DAYS dias
 *   e entao bloqueio;
 * - cancelada: liberado ate o fim do periodo pago, com aviso; depois bloqueia.
 */
export function computeAccess(sub: SubscriptionSnapshot, now: Date = new Date()): Access {
  switch (sub.status) {
    case "comp":
      return { level: "ok", message: null, until: null };

    case "trialing": {
      const end = sub.trialEndsAt;
      if (!end || now >= end) {
        return {
          level: "blocked",
          message: "Seu período de teste terminou. Escolha um plano para continuar.",
          until: end,
        };
      }
      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
      if (daysLeft <= 3) {
        return {
          level: "warning",
          message: `Seu teste grátis termina em ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"} (${formatDate(end)}). Escolha um plano para não perder o acesso.`,
          until: end,
        };
      }
      return { level: "ok", message: null, until: end };
    }

    case "active":
    case "past_due": {
      const end = sub.currentPeriodEnd;
      if (!end) {
        return {
          level: "blocked",
          message: "Não encontramos o pagamento da assinatura. Regularize para continuar.",
          until: null,
        };
      }
      if (now < end && sub.status === "active") {
        return { level: "ok", message: null, until: end };
      }
      const graceEnd = addDays(end, GRACE_DAYS);
      if (now < graceEnd) {
        return {
          level: "warning",
          message: `Não identificamos o pagamento da assinatura. Regularize até ${formatDate(graceEnd)} para não perder o acesso.`,
          until: graceEnd,
        };
      }
      return {
        level: "blocked",
        message: "A assinatura está em atraso. Regularize o pagamento para continuar.",
        until: graceEnd,
      };
    }

    case "canceled": {
      const end = sub.currentPeriodEnd;
      if (end && now < end) {
        return {
          level: "warning",
          message: `Assinatura cancelada. O acesso continua até ${formatDate(end)}.`,
          until: end,
        };
      }
      return {
        level: "blocked",
        message: "A assinatura foi cancelada. Escolha um plano para voltar a usar o painel.",
        until: end,
      };
    }
  }
}

/** Limites em vigor: os do plano pago; no teste e na cortesia, os do maior plano. */
export function effectiveLimits(sub: SubscriptionSnapshot): PlanLimits {
  if (sub.status === "trialing" || sub.status === "comp" || !isPlanId(sub.plan)) {
    return TRIAL_LIMITS;
  }
  return PLANS[sub.plan].limits;
}
