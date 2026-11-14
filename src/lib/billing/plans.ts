// Planos da assinatura do GlowHub (cobrada do salao). Precos e limites ficam no
// codigo: mudar um valor aqui vale para novas assinaturas; as ja criadas no
// provedor seguem com o valor contratado ate trocarem de plano.

export type PlanId = "solo" | "equipe" | "rede";

export type PlanLimits = {
  /** Profissionais ativos. `null` = ilimitado. */
  professionals: number | null;
  /** Filiais ativas. */
  branches: number | null;
  /** Usuarios do painel (membros + convites pendentes). */
  members: number | null;
};

export type Plan = {
  id: PlanId;
  name: string;
  description: string;
  priceCents: number;
  limits: PlanLimits;
};

export const PLANS: Record<PlanId, Plan> = {
  solo: {
    id: "solo",
    name: "Solo",
    description: "Para o profissional autônomo, com 1 ajudante eventual.",
    priceCents: 5990,
    limits: { professionals: 2, branches: 1, members: 2 },
  },
  equipe: {
    id: "equipe",
    name: "Equipe",
    description: "Para salões e estúdios com equipe.",
    priceCents: 12990,
    limits: { professionals: 8, branches: 1, members: 10 },
  },
  rede: {
    id: "rede",
    name: "Rede",
    description: "Para quem tem várias unidades.",
    priceCents: 29990,
    limits: { professionals: null, branches: 5, members: null },
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/** Dias de teste gratis para empresas novas. */
export const TRIAL_DAYS = 14;
/** Dias de tolerancia apos o vencimento sem pagamento antes do bloqueio. */
export const GRACE_DAYS = 7;
/** Durante o teste e na cortesia, os limites sao os do maior plano. */
export const TRIAL_LIMITS: PlanLimits = PLANS.rede.limits;

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in PLANS;
}

export type LimitKey = keyof PlanLimits;

export type Usage = Record<LimitKey, number>;

const LIMIT_LABELS: Record<LimitKey, [string, string]> = {
  professionals: ["profissional", "profissionais"],
  branches: ["filial", "filiais"],
  members: ["usuário", "usuários"],
};

export function limitLabel(key: LimitKey, count: number): string {
  const [one, many] = LIMIT_LABELS[key];
  return `${count} ${count === 1 ? one : many}`;
}

/** Ainda cabe mais um item do tipo `key`? */
export function canAdd(limits: PlanLimits, usage: Usage, key: LimitKey): boolean {
  const max = limits[key];
  return max === null || usage[key] < max;
}

/** Itens do uso atual que nao cabem nos limites (para trocar de plano). */
export function exceededLimits(limits: PlanLimits, usage: Usage): LimitKey[] {
  return (Object.keys(limits) as LimitKey[]).filter((key) => {
    const max = limits[key];
    return max !== null && usage[key] > max;
  });
}

export function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
