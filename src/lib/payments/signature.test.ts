import { describe, expect, it } from "vitest";
import {
  buildMercadoPagoManifest,
  hmacSha256Hex,
  parseMercadoPagoSignature,
  verifyHmacHex,
  verifyMercadoPagoSignature,
} from "./signature";
import { mapWebhookStatus } from "./types";

describe("verifyHmacHex", () => {
  const secret = "segredo";
  const body = '{"hello":"world"}';
  const signature = hmacSha256Hex(secret, body);

  it("aceita hex puro e com prefixo sha256=", () => {
    expect(verifyHmacHex(signature, body, secret)).toBe(true);
    expect(verifyHmacHex(`sha256=${signature}`, body, secret)).toBe(true);
  });

  it("rejeita assinatura errada ou ausente", () => {
    expect(verifyHmacHex("deadbeef", body, secret)).toBe(false);
    expect(verifyHmacHex(null, body, secret)).toBe(false);
  });

  it("rejeita corpo alterado", () => {
    expect(verifyHmacHex(signature, `${body}x`, secret)).toBe(false);
  });
});

describe("Mercado Pago", () => {
  it("monta o manifesto", () => {
    expect(
      buildMercadoPagoManifest({ dataId: "123", requestId: "req-1", ts: "999" }),
    ).toBe("id:123;request-id:req-1;ts:999;");
  });

  it("le o header x-signature", () => {
    expect(parseMercadoPagoSignature("ts=999,v1=abc")).toEqual({
      ts: "999",
      v1: "abc",
    });
    expect(parseMercadoPagoSignature("v1=abc")).toBeNull();
    expect(parseMercadoPagoSignature(null)).toBeNull();
  });

  it("valida a assinatura", () => {
    const secret = "mp-secret";
    const manifest = buildMercadoPagoManifest({
      dataId: "55",
      requestId: "req-9",
      ts: "1000",
    });
    const v1 = hmacSha256Hex(secret, manifest);
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: `ts=1000,v1=${v1}`,
        requestId: "req-9",
        dataId: "55",
        secret,
      }),
    ).toBe(true);
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: `ts=1000,v1=${v1}`,
        requestId: "outro",
        dataId: "55",
        secret,
      }),
    ).toBe(false);
  });
});

describe("mapWebhookStatus", () => {
  it("mapeia os estados do provedor", () => {
    expect(mapWebhookStatus("approved")).toBe("approved");
    expect(mapWebhookStatus("paid")).toBe("approved");
    expect(mapWebhookStatus("refunded")).toBe("refunded");
    expect(mapWebhookStatus("rejected")).toBe("rejected");
    expect(mapWebhookStatus("in_process")).toBe("pending");
    expect(mapWebhookStatus(undefined)).toBe("pending");
  });
});
