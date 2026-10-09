import { describe, expect, it } from "vitest";
import { isLowStock, movingAverageCost } from "./inventory";

describe("movingAverageCost", () => {
  it("adota o custo da entrada quando nao ha saldo", () => {
    expect(movingAverageCost(0, 0, 10, 500)).toBe(500);
  });

  it("adota o custo da entrada quando o custo anterior e zero", () => {
    expect(movingAverageCost(10, 0, 10, 800)).toBe(800);
  });

  it("calcula a media ponderada", () => {
    // 10 un a 100 + 10 un a 300 => 200
    expect(movingAverageCost(10, 100, 10, 300)).toBe(200);
  });

  it("arredonda para o centavo", () => {
    // 3 un a 100 + 1 un a 101 => 100.25 -> 100
    expect(movingAverageCost(3, 100, 1, 101)).toBe(100);
  });

  it("ignora entrada nao positiva", () => {
    expect(movingAverageCost(10, 250, 0, 999)).toBe(250);
  });
});

describe("isLowStock", () => {
  it("zerado ou negativo precisa reposicao", () => {
    expect(isLowStock(0, 0)).toBe(true);
    expect(isLowStock(-3, 0)).toBe(true);
  });

  it("sem minimo definido, so zero/negativo alerta", () => {
    expect(isLowStock(5, 0)).toBe(false);
  });

  it("no limite ou abaixo do minimo alerta", () => {
    expect(isLowStock(3, 3)).toBe(true);
    expect(isLowStock(2, 3)).toBe(true);
    expect(isLowStock(4, 3)).toBe(false);
  });
});
