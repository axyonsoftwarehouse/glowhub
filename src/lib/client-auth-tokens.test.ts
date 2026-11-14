import { describe, expect, it } from "vitest";
import {
  CLIENT_OTP_TTL_SECONDS,
  CLIENT_SESSION_TTL_DAYS,
  clientOtpExpiry,
  clientSessionExpiry,
  generateOtp,
  generateSessionToken,
  hashOtp,
  hashSessionToken,
  isExpired,
  isOtpCode,
  normalizeEmail,
  otpMatches,
} from "./client-auth-tokens";

const SECRET = "test-secret-at-least-32-characters-long";

describe("client auth tokens", () => {
  it("normaliza o e-mail", () => {
    expect(normalizeEmail("  Ana@Exemplo.COM ")).toBe("ana@exemplo.com");
  });

  it("gera sempre 6 dígitos", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
      expect(isOtpCode(code)).toBe(true);
    }
  });

  it("rejeita código fora do formato", () => {
    expect(isOtpCode("12345")).toBe(false);
    expect(isOtpCode("1234567")).toBe(false);
    expect(isOtpCode("abcdef")).toBe(false);
  });

  it("gera hash determinístico e ligado ao tenant/e-mail/código", () => {
    const base = { tenantId: "t1", email: "ana@exemplo.com", code: "123456", secret: SECRET };
    const hash = hashOtp(base);
    expect(hash).toBe(hashOtp(base));
    expect(hash).not.toBe(hashOtp({ ...base, tenantId: "t2" }));
    expect(hash).not.toBe(hashOtp({ ...base, email: "bia@exemplo.com" }));
    expect(hash).not.toBe(hashOtp({ ...base, code: "654321" }));
    expect(hash).not.toContain("123456");
  });

  it("não aceita código errado nem replay em outro tenant", () => {
    const params = {
      tenantId: "t1",
      email: "ana@exemplo.com",
      code: "123456",
      secret: SECRET,
    };
    const storedHash = hashOtp(params);
    expect(otpMatches({ storedHash, ...params })).toBe(true);
    expect(otpMatches({ storedHash, ...params, code: "000000" })).toBe(false);
    expect(otpMatches({ storedHash, ...params, tenantId: "t2" })).toBe(false);
  });

  it("respeita a expiração", () => {
    const now = new Date("2026-11-14T12:00:00Z");
    const expiry = clientOtpExpiry(now);
    expect(expiry.getTime() - now.getTime()).toBe(CLIENT_OTP_TTL_SECONDS * 1000);
    expect(isExpired(expiry, now)).toBe(false);
    expect(isExpired(now, expiry)).toBe(true);
  });

  it("gera token de sessão opaco e hash estável", () => {
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).not.toMatch(/[+/=]/);
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(hashSessionToken(generateSessionToken()));
  });

  it("define a sessão para 30 dias", () => {
    const now = new Date("2026-11-14T12:00:00Z");
    const expiry = clientSessionExpiry(now);
    expect(expiry.getTime() - now.getTime()).toBe(
      CLIENT_SESSION_TTL_DAYS * 86_400_000,
    );
  });
});
