import { verifyMercadoPagoSignature } from "@/lib/payments/signature";

/**
 * Provedores da assinatura da plataforma (o salao pagando o GlowHub). Separado
 * do gateway de `src/lib/payments`, que cobra os clientes do salao: contas,
 * credenciais e webhooks diferentes.
 */

export type BillingEvent =
  | {
      kind: "subscription";
      providerSubscriptionId: string;
      status: "authorized" | "paused" | "cancelled" | "pending";
    }
  | {
      kind: "payment";
      providerSubscriptionId: string;
      providerPaymentId: string;
      status: "approved" | "rejected" | "refunded";
      amountCents: number;
      paidAt: Date;
    }
  | { kind: "ignored" };

export type BillingWebhookRequest = {
  headers: Headers;
  url: URL;
  payload: unknown;
};

export type BillingProvider = {
  id: string;
  createSubscription(input: {
    tenantId: string;
    planName: string;
    amountCents: number;
    payerEmail: string;
  }): Promise<{ providerSubscriptionId: string; checkoutUrl: string }>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  verifyWebhook(request: BillingWebhookRequest): boolean;
  parseWebhook(request: BillingWebhookRequest): Promise<BillingEvent>;
};

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
}

/** Desenvolvimento/teste: checkout local em /billing/mock, sem chamadas externas. */
export const mockBillingProvider: BillingProvider = {
  id: "mock",
  async createSubscription(input) {
    const providerSubscriptionId = `mock_sub_${crypto.randomUUID()}`;
    const query = new URLSearchParams({
      sub: providerSubscriptionId,
      plan: input.planName,
      amount: String(input.amountCents),
    });
    return {
      providerSubscriptionId,
      checkoutUrl: `${appUrl()}/billing/mock?${query.toString()}`,
    };
  },
  async cancelSubscription() {},
  verifyWebhook() {
    return false;
  },
  async parseWebhook() {
    return { kind: "ignored" };
  },
};

const MP_API = "https://api.mercadopago.com";

function mpToken(): string {
  const token = process.env.BILLING_MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Billing Mercado Pago não configurado (defina BILLING_MP_ACCESS_TOKEN).");
  }
  return token;
}

async function mpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${mpToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Mercado Pago respondeu ${response.status}`);
  return (await response.json()) as T;
}

function readNotification(request: BillingWebhookRequest): { type: string | null; id: string | null } {
  const payload = (request.payload ?? {}) as { type?: unknown; data?: { id?: unknown } };
  const type =
    request.url.searchParams.get("type") ??
    request.url.searchParams.get("topic") ??
    (typeof payload.type === "string" ? payload.type : null);
  const rawId = request.url.searchParams.get("data.id") ?? payload.data?.id;
  const id = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : null;
  return { type, id };
}

function mapPreapprovalStatus(status: string | undefined) {
  if (status === "authorized") return "authorized" as const;
  if (status === "paused") return "paused" as const;
  if (status === "cancelled") return "cancelled" as const;
  return "pending" as const;
}

/**
 * Mercado Pago Assinaturas (preapproval sem plano associado). O checkout e o
 * `init_point`; a recorrencia mensal e cobrada pelo Mercado Pago. Webhooks
 * (configurados no painel do MP para esta URL): `subscription_preapproval`
 * (status da assinatura) e `subscription_authorized_payment` (cada cobranca).
 */
export const mercadoPagoBillingProvider: BillingProvider = {
  id: "mercadopago",
  async createSubscription(input) {
    const data = await mpFetch<{ id?: string; init_point?: string }>("/preapproval", {
      method: "POST",
      body: JSON.stringify({
        reason: `GlowHub — plano ${input.planName}`,
        external_reference: input.tenantId,
        payer_email: input.payerEmail,
        back_url: `${appUrl()}/billing?retorno=1`,
        status: "pending",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: input.amountCents / 100,
          currency_id: "BRL",
        },
      }),
    });
    if (!data.id || !data.init_point) throw new Error("Resposta inválida do Mercado Pago.");
    return { providerSubscriptionId: data.id, checkoutUrl: data.init_point };
  },
  async cancelSubscription(providerSubscriptionId) {
    await mpFetch(`/preapproval/${providerSubscriptionId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "cancelled" }),
    });
  },
  verifyWebhook(request) {
    const secret = process.env.BILLING_MP_WEBHOOK_SECRET;
    const { id } = readNotification(request);
    if (!secret || !id) return false;
    return verifyMercadoPagoSignature({
      signatureHeader: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId: id,
      secret,
    });
  },
  async parseWebhook(request) {
    const { type, id } = readNotification(request);
    if (!id) return { kind: "ignored" };

    if (type === "subscription_preapproval") {
      const preapproval = await mpFetch<{ id?: string; status?: string }>(`/preapproval/${id}`);
      return {
        kind: "subscription",
        providerSubscriptionId: preapproval.id ?? id,
        status: mapPreapprovalStatus(preapproval.status),
      };
    }

    if (type === "subscription_authorized_payment") {
      const charge = await mpFetch<{
        id?: string | number;
        preapproval_id?: string;
        transaction_amount?: number;
        debit_date?: string;
        date_created?: string;
        payment?: { id?: string | number; status?: string };
      }>(`/authorized_payments/${id}`);
      const status = charge.payment?.status;
      if (!charge.preapproval_id || !status) return { kind: "ignored" };
      const mapped =
        status === "approved"
          ? ("approved" as const)
          : status === "refunded" || status === "charged_back"
            ? ("refunded" as const)
            : status === "rejected" || status === "cancelled"
              ? ("rejected" as const)
              : null;
      if (!mapped) return { kind: "ignored" };
      return {
        kind: "payment",
        providerSubscriptionId: charge.preapproval_id,
        providerPaymentId: String(charge.payment?.id ?? charge.id ?? id),
        status: mapped,
        amountCents: Math.round((charge.transaction_amount ?? 0) * 100),
        paidAt: new Date(charge.debit_date ?? charge.date_created ?? Date.now()),
      };
    }

    return { kind: "ignored" };
  },
};

const PROVIDERS: Record<string, BillingProvider> = {
  mock: mockBillingProvider,
  mercadopago: mercadoPagoBillingProvider,
};

export function getBillingProvider(id: string | null | undefined): BillingProvider | null {
  return (id && PROVIDERS[id]) || null;
}

/** Provedor ativo conforme `BILLING_PROVIDER` (padrao `mock`). */
export function activeBillingProvider(): BillingProvider {
  return getBillingProvider(process.env.BILLING_PROVIDER) ?? mockBillingProvider;
}
