import { verifyHmacHex } from "./signature";
import { mapWebhookStatus, type PaymentProviderAdapter } from "./types";

/**
 * Provedor de desenvolvimento/teste: gera um link para a pagina local
 * `/pay/mock` onde a aprovacao pode ser simulada. Nao faz chamadas externas.
 */
export const mockProvider: PaymentProviderAdapter = {
  id: "mock",
  async createCheckout(input) {
    const providerRef = crypto.randomUUID();
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return {
      providerRef,
      checkoutUrl: `${base}/pay/mock?ref=${providerRef}&amount=${input.amountCents}`,
    };
  },
  verifyWebhook({ request, secret }) {
    const signature =
      request.headers.get("x-webhook-signature") ??
      request.headers.get("x-signature");
    return verifyHmacHex(signature, request.raw, secret);
  },
  async parseWebhook({ request }) {
    const body = request.payload as {
      type?: string;
      providerRef?: string;
      status?: string;
    } | null;
    if (!body || body.type !== "payment" || !body.providerRef) {
      return { kind: "ignored" };
    }
    return {
      kind: "payment",
      providerRef: body.providerRef,
      status: mapWebhookStatus(body.status),
    };
  },
};
