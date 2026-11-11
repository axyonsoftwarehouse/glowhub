import { describe, expect, it } from "vitest";
import {
  buildResetPasswordEmail,
  buildVerificationEmail,
  isAuthEmailSuppressed,
  isEmailVerificationRequired,
} from "./auth-emails";
import { authErrorMessage } from "./auth-errors";

describe("e-mails de autenticação", () => {
  it("monta o e-mail de redefinição com o link e o primeiro nome", () => {
    const email = buildResetPasswordEmail({
      name: "Ana Souza",
      url: "https://app.test/reset-password/abc?callbackURL=%2Freset-password",
    });
    expect(email.subject).toContain("senha");
    expect(email.html).toContain("Olá, Ana!");
    expect(email.html).toContain(
      'href="https://app.test/reset-password/abc?callbackURL=%2Freset-password"',
    );
  });

  it("escapa HTML no nome e no link", () => {
    const email = buildVerificationEmail({
      name: "<script>x</script>",
      url: 'https://app.test/v?a="b"',
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("&quot;b&quot;");
  });

  it("usa saudação genérica sem nome", () => {
    expect(buildVerificationEmail({ name: "  ", url: "https://x" }).html).toContain(
      "Olá!",
    );
  });
});

describe("isEmailVerificationRequired", () => {
  it("fica desligado por padrão", () => {
    expect(isEmailVerificationRequired({})).toBe(false);
    expect(isEmailVerificationRequired({ AUTH_REQUIRE_EMAIL_VERIFICATION: "1" })).toBe(
      false,
    );
  });

  it("liga só com o valor exato true", () => {
    expect(
      isEmailVerificationRequired({ AUTH_REQUIRE_EMAIL_VERIFICATION: "true" }),
    ).toBe(true);
  });
});

describe("isAuthEmailSuppressed", () => {
  it("não envia para a conta demo padrão nem para a configurada", () => {
    expect(isAuthEmailSuppressed("Demo@GlowHub.app", {})).toBe(true);
    expect(isAuthEmailSuppressed("vitrine@x.com", { DEMO_EMAIL: "vitrine@x.com" })).toBe(
      true,
    );
  });

  it("envia para contas comuns", () => {
    expect(isAuthEmailSuppressed("ana@salao.com", {})).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("traduz códigos conhecidos", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" }, "x")).toBe(
      "E-mail ou senha incorretos.",
    );
  });

  it("trata rate limit pelo status", () => {
    expect(authErrorMessage({ status: 429 }, "x")).toContain("Muitas tentativas");
  });

  it("usa o fallback para código desconhecido ou ausente", () => {
    expect(authErrorMessage({ code: "OUTRO" }, "Falhou.")).toBe("Falhou.");
    expect(authErrorMessage(null, "Falhou.")).toBe("Falhou.");
  });
});
