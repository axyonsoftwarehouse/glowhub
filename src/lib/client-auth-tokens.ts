import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

export const CLIENT_OTP_TTL_SECONDS = 10 * 60;
export const CLIENT_OTP_MAX_ATTEMPTS = 5;
export const CLIENT_SESSION_TTL_DAYS = 30;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Codigo numerico de 6 digitos (com zeros a esquerda). */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function isOtpCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function otpSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.CLIENT_OTP_SECRET?.trim() ||
    env.BETTER_AUTH_SECRET?.trim() ||
    "glowhub-dev-otp-secret"
  );
}

/** HMAC-SHA256 do codigo, ligado ao tenant e ao e-mail (evita replay cruzado). */
export function hashOtp(params: {
  tenantId: string;
  email: string;
  code: string;
  secret?: string;
}): string {
  const secret = params.secret ?? otpSecret();
  return createHmac("sha256", secret)
    .update(`${params.tenantId}:${normalizeEmail(params.email)}:${params.code}`)
    .digest("hex");
}

/** Comparacao em tempo constante entre o hash guardado e o codigo informado. */
export function otpMatches(params: {
  storedHash: string;
  tenantId: string;
  email: string;
  code: string;
  secret?: string;
}): boolean {
  const expected = hashOtp(params);
  const stored = Buffer.from(params.storedHash, "hex");
  const candidate = Buffer.from(expected, "hex");
  if (stored.length !== candidate.length) return false;
  return timingSafeEqual(stored, candidate);
}

export function isExpired(date: Date, now: Date = new Date()): boolean {
  return date.getTime() <= now.getTime();
}

export function clientOtpExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + CLIENT_OTP_TTL_SECONDS * 1000);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function clientSessionExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + CLIENT_SESSION_TTL_DAYS * 86_400_000);
}
