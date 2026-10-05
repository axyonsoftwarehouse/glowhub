export const PAGE_SIZE = 24;

export function parsePage(value: string | string[] | undefined): number {
  const raw = typeof value === "string" ? value : undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function pageOffset(page: number): number {
  return (page - 1) * PAGE_SIZE;
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
