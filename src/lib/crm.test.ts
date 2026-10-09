import { describe, expect, it } from "vitest";
import {
  averageTicketCents,
  classifyClient,
  formatTags,
  frequencyDays,
  isVip,
  parseTags,
  percentile,
  suggestedNextVisit,
  vipThresholdCents,
} from "./crm";

const NOW = new Date("2026-06-15T12:00:00Z");

describe("classifyClient", () => {
  it("sem visitas quando nao houve atendimento", () => {
    expect(
      classifyClient({ visits: 0, firstVisitAt: null, lastVisitAt: null }, NOW),
    ).toBe("sem_visitas");
  });

  it("novo quando e a primeira visita e recente", () => {
    expect(
      classifyClient(
        {
          visits: 1,
          firstVisitAt: new Date("2026-06-01T12:00:00Z"),
          lastVisitAt: new Date("2026-06-01T12:00:00Z"),
        },
        NOW,
      ),
    ).toBe("novo");
  });

  it("ativo quando recorrente e recente", () => {
    expect(
      classifyClient(
        {
          visits: 5,
          firstVisitAt: new Date("2025-01-01T12:00:00Z"),
          lastVisitAt: new Date("2026-06-01T12:00:00Z"),
        },
        NOW,
      ),
    ).toBe("ativo");
  });

  it("em risco entre 60 e 120 dias", () => {
    expect(
      classifyClient(
        {
          visits: 4,
          firstVisitAt: new Date("2025-01-01T12:00:00Z"),
          lastVisitAt: new Date("2026-04-15T12:00:00Z"),
        },
        NOW,
      ),
    ).toBe("em_risco");
  });

  it("inativo acima de 120 dias", () => {
    expect(
      classifyClient(
        {
          visits: 4,
          firstVisitAt: new Date("2024-01-01T12:00:00Z"),
          lastVisitAt: new Date("2025-12-01T12:00:00Z"),
        },
        NOW,
      ),
    ).toBe("inativo");
  });

  it("primeira visita antiga nao conta como novo", () => {
    expect(
      classifyClient(
        {
          visits: 1,
          firstVisitAt: new Date("2025-01-01T12:00:00Z"),
          lastVisitAt: new Date("2025-01-01T12:00:00Z"),
        },
        NOW,
      ),
    ).toBe("inativo");
  });
});

describe("metricas", () => {
  it("ticket medio arredonda", () => {
    expect(averageTicketCents(10000, 3)).toBe(3333);
    expect(averageTicketCents(10000, 0)).toBe(0);
  });

  it("frequencia media em dias", () => {
    expect(
      frequencyDays({
        visits: 5,
        firstVisitAt: new Date("2026-01-01T00:00:00Z"),
        lastVisitAt: new Date("2026-05-01T00:00:00Z"),
      }),
    ).toBe(30);
    expect(
      frequencyDays({
        visits: 1,
        firstVisitAt: new Date("2026-01-01T00:00:00Z"),
        lastVisitAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toBeNull();
  });

  it("sugere o proximo retorno pela frequencia", () => {
    const next = suggestedNextVisit({
      visits: 5,
      firstVisitAt: new Date("2026-01-01T00:00:00Z"),
      lastVisitAt: new Date("2026-05-01T00:00:00Z"),
    });
    expect(next?.toISOString().slice(0, 10)).toBe("2026-05-31");
  });
});

describe("vip", () => {
  it("percentil 90 do gasto define o limiar", () => {
    const threshold = vipThresholdCents([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    expect(threshold).toBe(900);
    expect(isVip(900, threshold)).toBe(true);
    expect(isVip(899, threshold)).toBe(false);
  });

  it("sem gasto nao ha VIP", () => {
    expect(vipThresholdCents([0, 0])).toBe(0);
    expect(isVip(0, 0)).toBe(false);
  });

  it("percentile lida com listas vazias", () => {
    expect(percentile([], 0.9)).toBe(0);
  });
});

describe("parseTags", () => {
  it("normaliza, deduplica e limita", () => {
    expect(parseTags("  Loira ,, morena, LOIRA ")).toEqual(["Loira", "morena"]);
  });

  it("retorna null quando vazio", () => {
    expect(parseTags("")).toBeNull();
    expect(parseTags("   ,  ")).toBeNull();
    expect(parseTags(undefined)).toBeNull();
  });

  it("limita a 10 tags", () => {
    const input = Array.from({ length: 15 }, (_, i) => `tag${i}`).join(",");
    expect(parseTags(input)).toHaveLength(10);
  });

  it("formata para exibicao", () => {
    expect(formatTags(["VIP", "loira"])).toBe("VIP, loira");
    expect(formatTags(null)).toBe("");
  });
});
