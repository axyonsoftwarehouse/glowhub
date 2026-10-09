export type ClientSegment =
  | "sem_visitas"
  | "novo"
  | "ativo"
  | "em_risco"
  | "inativo";

export const CLIENT_SEGMENT_LABELS: Record<ClientSegment, string> = {
  sem_visitas: "Sem visitas",
  novo: "Novo",
  ativo: "Ativo",
  em_risco: "Em risco",
  inativo: "Inativo",
};

/** Dias desde a ultima visita para o cliente ainda ser considerado ativo. */
export const RECENT_DAYS = 60;
/** Ate quantos dias desde a ultima visita o cliente esta "em risco". */
export const RISK_DAYS = 120;

export type ClientVisits = {
  visits: number;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
};

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Segmenta o cliente pela recencia (dias desde a ultima visita) e pela
 * quantidade de visitas: sem visitas, novo (1a visita recente), ativo, em risco
 * ou inativo. Logica pura para ser testavel e reutilizavel nas telas.
 */
export function classifyClient(
  metrics: ClientVisits,
  now: Date = new Date(),
): ClientSegment {
  if (metrics.visits <= 0 || !metrics.lastVisitAt) return "sem_visitas";
  const days = daysBetween(metrics.lastVisitAt, now);
  if (days <= RECENT_DAYS) {
    return metrics.visits <= 1 ? "novo" : "ativo";
  }
  if (days <= RISK_DAYS) return "em_risco";
  return "inativo";
}

/** Ticket medio em centavos (gasto total / numero de visitas). */
export function averageTicketCents(
  totalSpentCents: number,
  visits: number,
): number {
  if (visits <= 0) return 0;
  return Math.round(totalSpentCents / visits);
}

/** Frequencia media entre visitas em dias (null se houver menos de 2). */
export function frequencyDays(metrics: ClientVisits): number | null {
  if (metrics.visits < 2 || !metrics.firstVisitAt || !metrics.lastVisitAt) {
    return null;
  }
  return Math.round(
    daysBetween(metrics.firstVisitAt, metrics.lastVisitAt) / (metrics.visits - 1),
  );
}

/** Data sugerida do proximo retorno = ultima visita + frequencia media. */
export function suggestedNextVisit(
  metrics: ClientVisits,
): Date | null {
  const frequency = frequencyDays(metrics);
  if (frequency === null || !metrics.lastVisitAt) return null;
  return new Date(metrics.lastVisitAt.getTime() + frequency * 86_400_000);
}

/** Percentil (0..1) de uma lista de valores (nao muta a entrada). */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[index];
}

/** Limiar de VIP: percentil 90 do gasto dos clientes (com pelo menos 1 visita). */
export function vipThresholdCents(spendCents: number[]): number {
  const positive = spendCents.filter((value) => value > 0);
  if (positive.length === 0) return 0;
  return percentile(positive, 0.9);
}

export function isVip(totalSpentCents: number, thresholdCents: number): boolean {
  return thresholdCents > 0 && totalSpentCents >= thresholdCents;
}

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

/**
 * Normaliza tags vindas de um campo de texto separado por virgulas: remove
 * espacos, ignora vazias, limita tamanho/quantidade e remove duplicadas
 * (comparacao sem diferenciar maiusculas). Retorna `null` quando nao houver.
 */
export function parseTags(input: string | null | undefined): string[] | null {
  if (!input) return null;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of input.split(",")) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags.length > 0 ? tags : null;
}

export function formatTags(tags: string[] | null | undefined): string {
  return (tags ?? []).join(", ");
}
