export type OnlineMethod = "pix" | "credit" | "debit";

export type CheckoutInput = {
  amountCents: number;
  description: string;
  externalReference: string;
  method: OnlineMethod;
  payerEmail?: string | null;
};

export type CheckoutResult = {
  providerRef: string;
  checkoutUrl: string;
};

export type WebhookStatus = "approved" | "pending" | "rejected" | "refunded";

export type WebhookResult =
  | {
      kind: "payment";
      providerRef: string;
      status: WebhookStatus;
      externalReference?: string | null;
    }
  | { kind: "ignored" };

export type WebhookRequest = {
  raw: string;
  headers: Headers;
  url: URL;
  payload: unknown;
};

/**
 * Adapter portavel de gateway. Trocar de provedor = implementar esta interface e
 * registra-lo em `index.ts` (e definir `PAYMENT_PROVIDER`).
 */
export type PaymentProviderAdapter = {
  id: string;
  /**
   * Exige `WEBHOOK_<PROVIDER>_SECRET`/`WEBHOOK_SECRET`? Padrão `true`. Provedores
   * sem assinatura no webhook (ex.: InfinitePay) confirmam por API e podem
   * declarar `false`.
   */
  requiresSecret?: boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /**
   * Pode ser assíncrono para provedores que confirmam o evento por API (ex.:
   * InfinitePay, que não assina o webhook). Retorne `false` para recusar.
   */
  verifyWebhook(params: {
    request: WebhookRequest;
    secret: string;
  }): boolean | Promise<boolean>;
  parseWebhook(params: {
    request: WebhookRequest;
    secret: string;
  }): Promise<WebhookResult>;
};

export const ONLINE_METHODS: OnlineMethod[] = ["pix", "credit", "debit"];

export function mapWebhookStatus(
  raw: string | null | undefined,
): WebhookStatus {
  const value = (raw ?? "").toLowerCase();
  if (["approved", "paid", "succeeded"].includes(value)) return "approved";
  if (["refunded", "charged_back"].includes(value)) return "refunded";
  if (["rejected", "cancelled", "failed"].includes(value)) return "rejected";
  return "pending";
}
