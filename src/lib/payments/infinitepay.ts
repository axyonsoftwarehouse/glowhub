import type { PaymentProviderAdapter, WebhookStatus } from "./types";

const API_BASE = "https://api.checkout.infinitepay.io";

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    process.env.BETTER_AUTH_URL?.replace(/\/+$/, "") ||
    ""
  );
}

function handle(): string | null {
  const value = process.env.INFINITEPAY_HANDLE?.trim();
  return value ? value.replace(/^\$/, "") : null;
}

function apiKey(): string | null {
  return process.env.INFINITEPAY_API_KEY?.trim() || null;
}

function headers(): Record<string, string> {
  const key = apiKey();
  return {
    "Content-Type": "application/json",
    ...(key ? { "X-Api-Key": key } : {}),
  };
}

type PaymentCheckPayload = {
  invoice_slug?: unknown;
  transaction_nsu?: unknown;
  order_nsu?: unknown;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * InfinitePay não assina o webhook. A confirmação autoritativa é feita no
 * `/payment_check` (handle + order_nsu + transaction_nsu + slug), como manda a
 * documentação. Retorna `null` quando não há como confirmar.
 */
async function paymentCheck(payload: PaymentCheckPayload): Promise<{
  success: boolean;
  paid: boolean;
} | null> {
  const tag = handle();
  const orderNsu = readString(payload.order_nsu);
  const transactionNsu = readString(payload.transaction_nsu);
  const slug = readString(payload.invoice_slug);
  if (!tag || !orderNsu || !transactionNsu || !slug) return null;

  const response = await fetch(`${API_BASE}/payment_check`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      handle: tag,
      order_nsu: orderNsu,
      transaction_nsu: transactionNsu,
      slug,
    }),
  });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    success?: boolean;
    paid?: boolean;
  };
  return { success: data.success === true, paid: data.paid === true };
}

function readEvent(payload: unknown, url: URL): string | null {
  const fromQuery =
    url.searchParams.get("event") ?? url.searchParams.get("type");
  if (fromQuery) return fromQuery.toLowerCase();

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["event", "type", "status"]) {
      const value = record[key];
      if (typeof value === "string") return value.toLowerCase();
    }
  }
  return null;
}

function mapEventStatus(event: string | null): WebhookStatus | null {
  if (!event) return null;
  if (["paid", "settled", "approved"].includes(event)) return "approved";
  if (["refunded", "refund", "charged_back"].includes(event)) return "refunded";
  if (
    ["canceled", "cancelled", "payment_failed", "failed", "rejected"].includes(
      event,
    )
  ) {
    return "rejected";
  }
  if (["created", "pending"].includes(event)) return "pending";
  return null;
}

/**
 * InfinitePay Checkout Integrado.
 *
 * - Link: POST https://api.checkout.infinitepay.io/links (price em centavos).
 * - Webhook: sem assinatura; confirmamos no `/payment_check`.
 * - Não há sandbox oficial: use valores baixos para testar.
 */
export const infinitePayProvider: PaymentProviderAdapter = {
  id: "infinitepay",
  requiresSecret: false,
  async createCheckout(input) {
    const tag = handle();
    const key = apiKey();
    if (!tag && !key) {
      throw new Error(
        "InfinitePay não configurado (defina INFINITEPAY_HANDLE e/ou INFINITEPAY_API_KEY).",
      );
    }

    const base = appUrl();
    if (!base) {
      throw new Error(
        "InfinitePay requer NEXT_PUBLIC_APP_URL (ou BETTER_AUTH_URL) com URL pública.",
      );
    }

    const response = await fetch(`${API_BASE}/links`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        ...(tag ? { handle: tag } : {}),
        items: [
          {
            quantity: 1,
            price: input.amountCents,
            description: input.description,
          },
        ],
        order_nsu: input.externalReference,
        redirect_url: `${base}/pay/success`,
        webhook_url: `${base}/api/webhooks/infinitepay`,
        ...(input.payerEmail
          ? { customer: { email: input.payerEmail } }
          : {}),
        // options exige API Key. O cartão fica sempre habilitado; só o Pix liga/desliga.
        ...(key
          ? {
              options: {
                payment_methods_enabled:
                  input.method === "pix"
                    ? ["credit_card", "pix"]
                    : ["credit_card"],
              },
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `InfinitePay respondeu ${response.status}${
          detail ? `: ${detail.slice(0, 200)}` : ""
        }`,
      );
    }

    const data = (await response.json()) as { url?: string };
    if (!data.url) {
      throw new Error("Resposta inválida da InfinitePay (sem URL de checkout).");
    }

    // order_nsu é o elo entre o link e o webhook (provider_ref).
    return { providerRef: input.externalReference, checkoutUrl: data.url };
  },

  async verifyWebhook({ request }) {
    const check = await paymentCheck(
      (request.payload ?? {}) as PaymentCheckPayload,
    );
    return check?.success === true;
  },

  async parseWebhook({ request }) {
    const payload = (request.payload ?? {}) as PaymentCheckPayload & {
      amount?: unknown;
      paid_amount?: unknown;
    };
    const orderNsu = readString(payload.order_nsu);
    const event = readEvent(payload, request.url);
    const mapped = mapEventStatus(event);

    if (!orderNsu) return { kind: "ignored" };

    if (mapped) {
      return {
        kind: "payment",
        providerRef: orderNsu,
        status: mapped,
        externalReference: orderNsu,
      };
    }

    // Sem evento explícito no corpo: o status confiável vem do payment_check.
    const check = await paymentCheck(payload);
    if (!check) return { kind: "ignored" };

    return {
      kind: "payment",
      providerRef: orderNsu,
      status: check.paid ? "approved" : "pending",
      externalReference: orderNsu,
    };
  },
};
