"use server";

import { z } from "zod";
import {
  analyzeReceipt,
  askAssistant,
  generateWriting,
  isAssistantConfigured,
  runAnalysis,
  type AnalysisKind,
  type AssistantMessage,
  type AssistantTenant,
  type ReceiptAnalysis,
  type WritingRequest,
} from "@/lib/assistant";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";

export type AssistantActionResult =
  | { status: "success"; answer: string }
  | { status: "error"; message: string };

export type ReceiptActionResult =
  | { status: "success"; analysis: ReceiptAnalysis }
  | { status: "error"; message: string };

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

const questionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Escreva uma pergunta.")
    .max(2000, "Pergunta muito longa."),
  history: z.array(messageSchema).max(20).default([]),
});

const writingSchema = z.object({
  kind: z.enum(["whatsapp", "description", "promotion", "reply", "instagram"]),
  tone: z.enum(["simples", "acolhedor", "profissional", "divertido"]),
  context: z
    .string()
    .trim()
    .min(3, "Descreva o que você quer escrever.")
    .max(1000, "Contexto muito longo."),
  audience: z.string().trim().max(200).optional(),
});

const analysisSchema = z.enum(["today", "week", "inactive", "cash"]);

const imageSchema = z
  .string()
  .min(100, "Envie uma imagem.")
  .max(1_000_000, "Imagem muito grande. Tire uma foto menor e tente de novo.")
  .regex(
    /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/,
    "Envie uma imagem PNG, JPG ou WebP.",
  );

async function guard(): Promise<
  { error: string } | { userId: string; tenant: AssistantTenant }
> {
  const session = await getSession();
  if (!session?.user) {
    return { error: "Entre para usar o assistente." };
  }

  if (!isAssistantConfigured()) {
    return {
      error:
        "O assistente ainda não está configurado. Defina OPENROUTER_API_KEY no ambiente.",
    };
  }

  const limited = await checkRateLimit({
    key: `assistant:${session.user.id}`,
    limit: 20,
    windowSeconds: 300,
  });
  if (!limited.allowed) {
    return {
      error: "Muitas solicitações em pouco tempo. Aguarde alguns minutos.",
    };
  }

  const tenant = await getCurrentTenant();
  if (!tenant) {
    return {
      error: "Nenhuma empresa identificada para consultar os dados.",
    };
  }

  return {
    userId: session.user.id,
    tenant: { id: tenant.id, name: tenant.name, isSolo: tenant.isSolo },
  };
}

function failure(cause: unknown): { status: "error"; message: string } {
  logger.error("assistant_failed", {
    error: cause instanceof Error ? cause.message : String(cause),
  });
  return {
    status: "error",
    message: "Não foi possível concluir agora. Tente de novo.",
  };
}

export async function askAssistantAction(
  question: string,
  history: AssistantMessage[],
): Promise<AssistantActionResult> {
  const prepared = await guard();
  if ("error" in prepared) {
    return { status: "error", message: prepared.error };
  }

  const parsed = questionSchema.safeParse({ question, history });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Pergunta inválida.",
    };
  }

  try {
    const answer = await askAssistant({
      userId: prepared.userId,
      tenant: prepared.tenant,
      question: parsed.data.question,
      history: parsed.data.history,
    });
    return { status: "success", answer };
  } catch (cause) {
    return failure(cause);
  }
}

export async function generateWritingAction(
  request: WritingRequest,
): Promise<AssistantActionResult> {
  const prepared = await guard();
  if ("error" in prepared) {
    return { status: "error", message: prepared.error };
  }

  const parsed = writingSchema.safeParse(request);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Pedido inválido.",
    };
  }

  try {
    const answer = await generateWriting({
      userId: prepared.userId,
      tenant: prepared.tenant,
      request: parsed.data,
    });
    return { status: "success", answer };
  } catch (cause) {
    return failure(cause);
  }
}

export async function runAnalysisAction(
  kind: AnalysisKind,
): Promise<AssistantActionResult> {
  const prepared = await guard();
  if ("error" in prepared) {
    return { status: "error", message: prepared.error };
  }

  const parsed = analysisSchema.safeParse(kind);
  if (!parsed.success) {
    return { status: "error", message: "Análise inválida." };
  }

  try {
    const answer = await runAnalysis({
      userId: prepared.userId,
      tenant: prepared.tenant,
      kind: parsed.data,
    });
    return { status: "success", answer };
  } catch (cause) {
    return failure(cause);
  }
}

export async function analyzeReceiptAction(
  imageDataUrl: string,
): Promise<ReceiptActionResult> {
  const prepared = await guard();
  if ("error" in prepared) {
    return { status: "error", message: prepared.error };
  }

  const parsed = imageSchema.safeParse(imageDataUrl);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Imagem inválida.",
    };
  }

  try {
    const analysis = await analyzeReceipt({
      userId: prepared.userId,
      tenant: prepared.tenant,
      imageDataUrl: parsed.data,
    });
    if (!analysis.isReceipt) {
      return {
        status: "error",
        message:
          "Não identifiquei um comprovante de pagamento na imagem. Tente uma foto mais nítida.",
      };
    }
    return { status: "success", analysis };
  } catch (cause) {
    return failure(cause);
  }
}
