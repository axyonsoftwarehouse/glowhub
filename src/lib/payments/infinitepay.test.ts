import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { infinitePayProvider } from "./infinitepay";
import type { WebhookRequest } from "./types";

function webhookRequest(payload: unknown): WebhookRequest {
  return {
    raw: JSON.stringify(payload),
    headers: new Headers(),
    url: new URL("https://example.com/api/webhooks/infinitepay"),
    payload,
  };
}

describe("InfinitePay", () => {
  beforeEach(() => {
    vi.stubEnv("INFINITEPAY_HANDLE", "pamela");
    vi.stubEnv("INFINITEPAY_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://glowhub.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("cria o link com valor em centavos e order_nsu", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "https://pay.infinitepay.io/abc" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await infinitePayProvider.createCheckout({
      amountCents: 8000,
      description: "Comanda",
      externalReference: "charge-1",
      method: "pix",
      payerEmail: "cliente@example.com",
    });

    expect(result).toEqual({
      providerRef: "charge-1",
      checkoutUrl: "https://pay.infinitepay.io/abc",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.checkout.infinitepay.io/links");
    const body = JSON.parse(String(init.body));
    expect(body.handle).toBe("pamela");
    expect(body.order_nsu).toBe("charge-1");
    expect(body.items).toEqual([
      { quantity: 1, price: 8000, description: "Comanda" },
    ]);
    expect(body.webhook_url).toBe(
      "https://glowhub.test/api/webhooks/infinitepay",
    );
    expect(body.redirect_url).toBe("https://glowhub.test/pay/success");
  });

  it("confirma o webhook pelo payment_check", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, paid: true }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const valid = await infinitePayProvider.verifyWebhook({
      request: webhookRequest({
        invoice_slug: "inv-1",
        order_nsu: "charge-1",
        transaction_nsu: "tx-1",
      }),
      secret: "",
    });

    expect(valid).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.checkout.infinitepay.io/payment_check");
    expect(JSON.parse(String(init.body))).toMatchObject({
      handle: "pamela",
      order_nsu: "charge-1",
      transaction_nsu: "tx-1",
      slug: "inv-1",
    });
  });

  it("recusa quando o payment_check não confirma", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, paid: false }), {
          status: 200,
        }),
      ),
    );

    const valid = await infinitePayProvider.verifyWebhook({
      request: webhookRequest({
        invoice_slug: "inv-1",
        order_nsu: "charge-1",
        transaction_nsu: "tx-1",
      }),
      secret: "",
    });
    expect(valid).toBe(false);
  });

  it("mapeia eventos pagos e estornados sem chamar a API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const paid = await infinitePayProvider.parseWebhook({
      request: webhookRequest({
        event: "paid",
        invoice_slug: "inv-1",
        order_nsu: "charge-1",
        transaction_nsu: "tx-1",
      }),
      secret: "",
    });
    expect(paid).toMatchObject({
      kind: "payment",
      providerRef: "charge-1",
      status: "approved",
    });

    const refunded = await infinitePayProvider.parseWebhook({
      request: webhookRequest({
        event: "refunded",
        invoice_slug: "inv-1",
        order_nsu: "charge-1",
        transaction_nsu: "tx-1",
      }),
      secret: "",
    });
    expect(refunded).toMatchObject({
      kind: "payment",
      providerRef: "charge-1",
      status: "refunded",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem evento, usa o payment_check para o status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, paid: false }), {
          status: 200,
        }),
      ),
    );

    const result = await infinitePayProvider.parseWebhook({
      request: webhookRequest({
        invoice_slug: "inv-1",
        order_nsu: "charge-1",
        transaction_nsu: "tx-1",
      }),
      secret: "",
    });
    expect(result).toMatchObject({
      kind: "payment",
      providerRef: "charge-1",
      status: "pending",
    });
  });
});
