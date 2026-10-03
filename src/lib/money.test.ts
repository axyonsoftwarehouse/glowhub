import { describe, expect, it } from "vitest";
import {
  formatCentsBRL,
  formatCentsToInput,
  parsePriceToCents,
} from "./money";

describe("parsePriceToCents", () => {
  it("trata vazio como zero", () => {
    expect(parsePriceToCents("")).toBe(0);
    expect(parsePriceToCents("   ")).toBe(0);
  });

  it("converte inteiro", () => {
    expect(parsePriceToCents("120")).toBe(12000);
  });

  it("converte decimal com vírgula", () => {
    expect(parsePriceToCents("120,50")).toBe(12050);
  });

  it("converte decimal com ponto", () => {
    expect(parsePriceToCents("120.50")).toBe(12050);
  });

  it("converte separador de milhar pt-BR", () => {
    expect(parsePriceToCents("1.234,56")).toBe(123456);
  });

  it("ignora o prefixo R$", () => {
    expect(parsePriceToCents("R$ 10,00")).toBe(1000);
  });

  it("rejeita valores negativos", () => {
    expect(parsePriceToCents("-5")).toBeNull();
  });

  it("rejeita texto inválido", () => {
    expect(parsePriceToCents("abc")).toBeNull();
  });
});

describe("formatação", () => {
  it("formatCentsToInput usa vírgula", () => {
    expect(formatCentsToInput(12050)).toBe("120,50");
  });

  it("formatCentsBRL usa milhar pt-BR e R$", () => {
    expect(formatCentsBRL(123456)).toBe("R$ 1.234,56");
    expect(formatCentsBRL(0)).toBe("R$ 0,00");
  });
});
