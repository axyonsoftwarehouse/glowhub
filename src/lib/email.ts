import { logger } from "@/lib/logger";

export type EmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Envio de e-mail portavel. Se RESEND_API_KEY estiver configurada, usa a API do
 * Resend; caso contrario, apenas registra no console (dev). Trocar de provedor
 * significa ajustar apenas esta funcao.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "GlowHub <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(
      `[email:dev] para=${params.to} assunto="${params.subject}"`,
    );
    return { ok: true, id: `dev-${crypto.randomUUID()}` };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!response.ok) {
      return { ok: false, error: `Resend respondeu ${response.status}` };
    }
    const data = (await response.json()) as { id?: string };
    return { ok: true, id: data.id ?? "unknown" };
  } catch (cause) {
    logger.error("email_send_failed", {
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return { ok: false, error: "Falha ao enviar e-mail." };
  }
}
