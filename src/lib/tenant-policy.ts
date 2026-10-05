/**
 * Politicas por tenant de cancelamento e no-show.
 * Dinheiro sempre em centavos.
 */

export const OVERRIDE_ROLES = ["owner", "admin", "manager"];

export function isWithinCancellationWindow(
  startsAt: Date,
  windowHours: number,
  now: Date = new Date(),
): boolean {
  if (windowHours <= 0) return false;
  return startsAt.getTime() - now.getTime() < windowHours * 3_600_000;
}

export function noShowFeeCents(priceCents: number, percent: number): number {
  if (percent <= 0 || priceCents <= 0) return 0;
  return Math.round((priceCents * percent) / 100);
}
