/**
 * Dinheiro do GlowHub e sempre armazenado em centavos (inteiro).
 * Estes helpers convertem a entrada/saida de texto sem usar float em repouso.
 */

export function parsePriceToCents(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(/R\$/gi, "");
  if (cleaned === "") return 0;

  let normalized = cleaned;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;

  return Math.round(value * 100);
}

export function formatCentsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function formatCentsBRL(cents: number): string {
  const [integerPart, decimalPart] = (cents / 100).toFixed(2).split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${grouped},${decimalPart}`;
}
