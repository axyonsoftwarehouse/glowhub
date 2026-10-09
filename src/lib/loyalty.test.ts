import { describe, expect, it } from "vitest";
import {
  creditCentsForPoints,
  giftCardBalance,
  pointsForAmount,
} from "./loyalty";

describe("pointsForAmount", () => {
  it("converte reais gastos em pontos", () => {
    // 1 ponto por real: R$ 50,00 => 50 pontos
    expect(pointsForAmount(5000, 1)).toBe(50);
    // 2 pontos por real
    expect(pointsForAmount(5000, 2)).toBe(100);
  });

  it("arredonda para baixo", () => {
    // R$ 10,99 / 100 = 10,99 -> 10 pontos com 1 pt/R$
    expect(pointsForAmount(1099, 1)).toBe(10);
  });

  it("desativado ou sem valor gera zero", () => {
    expect(pointsForAmount(0, 1)).toBe(0);
    expect(pointsForAmount(5000, 0)).toBe(0);
  });
});

describe("creditCentsForPoints", () => {
  it("converte pontos em credito", () => {
    // 100 pontos = R$ 1,00
    expect(creditCentsForPoints(100, 100)).toBe(100);
    expect(creditCentsForPoints(250, 100)).toBe(250);
  });

  it("arredonda para baixo", () => {
    expect(creditCentsForPoints(150, 100)).toBe(150);
    expect(creditCentsForPoints(99, 100)).toBe(99);
  });

  it("sem pontos gera zero", () => {
    expect(creditCentsForPoints(0, 100)).toBe(0);
    expect(creditCentsForPoints(10, 0)).toBe(0);
  });
});

describe("giftCardBalance", () => {
  it("desconta os resgates", () => {
    expect(giftCardBalance(10000, 2500)).toBe(7500);
  });

  it("nunca fica negativo", () => {
    expect(giftCardBalance(10000, 12000)).toBe(0);
  });
});
