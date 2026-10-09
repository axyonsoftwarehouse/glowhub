"use server";

import { getDb } from "@/lib/db";
import { processPaymentWebhook } from "@/lib/payments/confirm";

export type MockPaymentState = { status: "idle" | "done"; message?: string };

/**
 * Simula a resposta do provedor mock (dev/teste): aplica o resultado de um
 * webhook ao pagamento pendente correspondente. Bloqueado em producão.
 */
export async function simulateMockPaymentAction(
  _prev: MockPaymentState,
  formData: FormData,
): Promise<MockPaymentState> {
  if (process.env.NODE_ENV === "production") {
    return { status: "idle", message: "Indisponível em produção." };
  }
  const providerRef = String(formData.get("ref") ?? "");
  const decision = String(formData.get("decision") ?? "approved");
  if (!providerRef) return { status: "idle", message: "Referência ausente." };

  await getDb().transaction((tx) =>
    processPaymentWebhook(tx, {
      providerId: "mock",
      result: {
        kind: "payment",
        providerRef,
        status: decision === "rejected" ? "rejected" : "approved",
      },
    }),
  );

  return {
    status: "done",
    message:
      decision === "rejected"
        ? "Pagamento recusado (simulado)."
        : "Pagamento aprovado (simulado).",
  };
}
