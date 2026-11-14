"use server";

import { z } from "zod";
import {
  askAssistant,
  isAssistantConfigured,
  type AssistantMessage,
} from "@/lib/assistant";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";

export type AssistantActionResult =
  | { status: "success"; answer: string }
  | { status: "error"; message: string };

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

const inputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Escreva uma pergunta.")
    .max(2000, "Pergunta muito longa."),
  history: z.array(messageSchema).max(20).default([]),
});

export async function askAssistantAction(
  question: string,
  history: AssistantMessage[],
): Promise<AssistantActionResult> {
  const session = await getSession();
  if (!session?.user) {
    return { status: "error", message: "Entre para usar o assistente." };
  }

  if (!isAssistantConfigured()) {
    return {
      status: "error",
      message:
        "O assistente ainda não está configurado. Defina OPENROUTER_API_KEY no ambiente.",
    };
  }

  const parsed = inputSchema.safeParse({ question, history });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Pergunta inválida.",
    };
  }

  const limited = await checkRateLimit({
    key: `assistant:${session.user.id}`,
    limit: 20,
    windowSeconds: 300,
  });
  if (!limited.allowed) {
    return {
      status: "error",
      message: "Muitas perguntas em pouco tempo. Aguarde alguns minutos.",
    };
  }

  const tenant = await getCurrentTenant();
  if (!tenant) {
    return {
      status: "error",
      message: "Nenhuma empresa identificada para consultar os dados.",
    };
  }

  try {
    const answer = await askAssistant({
      userId: session.user.id,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        isSolo: tenant.isSolo,
      },
      question: parsed.data.question,
      history: parsed.data.history,
    });
    return { status: "success", answer };
  } catch (cause) {
    logger.error("assistant_failed", {
      tenantId: tenant.id,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return {
      status: "error",
      message: "Não foi possível falar com o assistente agora. Tente de novo.",
    };
  }
}
