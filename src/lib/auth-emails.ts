import { getAppEnv } from "@/lib/app-env";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

type Env = Record<string, string | undefined>;

export type AuthEmail = { subject: string; html: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(params: {
  greeting: string;
  intro: string;
  cta: string;
  url: string;
  outro: string;
}): string {
  const url = escapeHtml(params.url);
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1f1f1f">
<p style="font-size:18px;font-weight:bold">Glow<span style="color:#a21caf">Hub</span></p>
<p>${params.greeting}</p>
<p>${params.intro}</p>
<p style="margin:24px 0"><a href="${url}" style="background:#a21caf;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">${params.cta}</a></p>
<p style="font-size:13px;color:#555">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${url}">${url}</a></p>
<p style="font-size:13px;color:#555">${params.outro}</p>
</div>`;
}

function greeting(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Olá, ${escapeHtml(first)}!` : "Olá!";
}

export function buildResetPasswordEmail(params: {
  name?: string | null;
  url: string;
}): AuthEmail {
  return {
    subject: "Redefinir sua senha do GlowHub",
    html: layout({
      greeting: greeting(params.name),
      intro:
        "Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora.",
      cta: "Criar nova senha",
      url: params.url,
      outro:
        "Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.",
    }),
  };
}

export function buildVerificationEmail(params: {
  name?: string | null;
  url: string;
}): AuthEmail {
  return {
    subject: "Confirme seu e-mail no GlowHub",
    html: layout({
      greeting: greeting(params.name),
      intro:
        "Confirme seu endereço de e-mail para proteger sua conta e receber avisos do sistema. O link vale por 24 horas.",
      cta: "Confirmar e-mail",
      url: params.url,
      outro: "Se você não criou uma conta no GlowHub, ignore este e-mail.",
    }),
  };
}

/**
 * Exige e-mail confirmado para entrar? Desligado por padrao: enquanto nao houver
 * provedor de e-mail real (depende do dominio), exigir travaria todo cadastro.
 * Ligue com `AUTH_REQUIRE_EMAIL_VERIFICATION=true` quando o envio estiver ativo.
 */
export function isEmailVerificationRequired(env: Env = process.env): boolean {
  return env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true";
}

/** Contas que nunca recebem e-mail de autenticacao (ex.: conta demo). */
export function isAuthEmailSuppressed(
  email: string,
  env: Env = process.env,
): boolean {
  const demoEmail = (env.DEMO_EMAIL?.trim() || "demo@glowhub.app").toLowerCase();
  return email.trim().toLowerCase() === demoEmail;
}

/**
 * Envia um e-mail de autenticacao na hora (sem caixa de saida: o link expira e
 * nao pertence a nenhum tenant). Sem provedor configurado, fora de producao,
 * registra o link no console para permitir testar o fluxo localmente.
 */
export async function deliverAuthEmail(params: {
  to: string;
  email: AuthEmail;
  url: string;
  kind: "reset_password" | "verify_email";
}): Promise<void> {
  if (isAuthEmailSuppressed(params.to)) return;

  if (!process.env.RESEND_API_KEY && getAppEnv() !== "production") {
    console.log(`[auth-email:dev] ${params.kind} para=${params.to} link=${params.url}`);
  }

  const result = await sendEmail({
    to: params.to,
    subject: params.email.subject,
    html: params.email.html,
  });
  if (!result.ok) {
    logger.error("auth_email_failed", { kind: params.kind, error: result.error });
  }
}
