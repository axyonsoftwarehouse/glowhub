import { verifyMercadoPagoSignature } from "./signature";
import { mapWebhookStatus, type PaymentProviderAdapter } from "./types";

const CHECKOUT_URL = "https://api.mercadopago.com/checkout/preferences";
const PAYMENTS_URL = "https://api.mercadopago.com/v1/payments";

function accessToken(): string {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Mercado Pago não configurado (defina MERCADO_PAGO_ACCESS_TOKEN).",
    );
  }
  return token;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}

function readDataId(payload: unknown): string | null {
  if (payload && typeof payload === "object") {
    const data = (payload as { data?: { id?: unknown } }).data;
    if (typeof data?.id === "string") return data.id;
    if (typeof data?.id === "number") return String(data.id);
  }
  return null;
}

function readType(payload: unknown): string | null {
  if (payload && typeof payload === "object") {
    const type = (payload as { type?: unknown }).type;
    if (typeof type === "string") return type;
  }
  return null;
}

/**
 * Mercado Pago (Checkout Pro). Cria uma preferencia e retorna o `init_point`
 * (link hospedado). O webhook chega como `?type=payment&data.id=...`, assinado
 * em `x-signature`; buscamos o pagamento para saber o status real.
 */
export const mercadoPagoProvider: PaymentProviderAdapter = {
  id: "mercadopago",
  async createCheckout(input) {
    const token = accessToken();
    const base = appUrl();
    const response = await fetch(CHECKOUT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            title: input.description,
            quantity: 1,
            unit_price: input.amountCents / 100,
            currency_id: "BRL",
          },
        ],
        external_reference: input.externalReference,
        ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {}),
        payment_methods:
          input.method === "pix"
            ? {
                excluded_payment_types: [
                  { id: "credit_card" },
                  { id: "debit_card" },
                  { id: "ticket" },
                ],
              }
            : { excluded_payment_types: [{ id: "ticket" }] },
        back_urls: {
          success: `${base}/pay/success`,
          failure: `${base}/pay/failure`,
          pending: `${base}/pay/pending`,
        },
        auto_return: "approved",
        notification_url: `${base}/api/webhooks/mercadopago`,
      }),
    });
    if (!response.ok) {
      throw new Error(`Mercado Pago respondeu ${response.status}`);
    }
    const data = (await response.json()) as {
      id?: string | number;
      init_point?: string;
      sandbox_init_point?: string;
    };
    const providerRef = String(data.id ?? "");
    const checkoutUrl = data.init_point ?? data.sandbox_init_point ?? "";
    if (!providerRef || !checkoutUrl) {
      throw new Error("Resposta inválida do Mercado Pago.");
    }
    return { providerRef, checkoutUrl };
  },
  verifyWebhook({ request, secret }) {
    const dataId =
      request.url.searchParams.get("data.id") ?? readDataId(request.payload);
    if (!dataId) return false;
    return verifyMercadoPagoSignature({
      signatureHeader: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId,
      secret,
    });
  },
  async parseWebhook({ request }) {
    const type =
      request.url.searchParams.get("type") ?? readType(request.payload);
    const dataId =
      request.url.searchParams.get("data.id") ?? readDataId(request.payload);
    if (type !== "payment" || !dataId) return { kind: "ignored" };

    const response = await fetch(`${PAYMENTS_URL}/${dataId}`, {
      headers: { Authorization: `Bearer ${accessToken()}` },
    });
    if (!response.ok) {
      throw new Error(`Mercado Pago respondeu ${response.status}`);
    }
    const payment = (await response.json()) as {
      status?: string;
      external_reference?: string;
    };
    return {
      kind: "payment",
      providerRef: String(dataId),
      status: mapWebhookStatus(payment.status),
      externalReference: payment.external_reference ?? null,
    };
  },
};
