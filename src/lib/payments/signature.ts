import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a.trim(), "hex");
  const right = Buffer.from(b.trim(), "hex");
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verifica HMAC-SHA256 do corpo bruto no formato generico aceito pelo endpoint
 * (`sha256=<hex>` ou `<hex>`). Comparacao em tempo constante.
 */
export function verifyHmacHex(
  signature: string | null,
  message: string,
  secret: string,
): boolean {
  if (!signature) return false;
  const hex = signature.replace(/^sha256=/i, "").trim();
  return safeEqualHex(hex, hmacSha256Hex(secret, message));
}

export type MercadoPagoSignature = { ts: string; v1: string };

/** Le o header `x-signature` do Mercado Pago (`ts=...,v1=...`). */
export function parseMercadoPagoSignature(
  header: string | null,
): MercadoPagoSignature | null {
  if (!header) return null;
  const parts = header.split(",").map((part) => part.trim());
  const ts = parts.find((part) => part.startsWith("ts="))?.slice(3);
  const v1 = parts.find((part) => part.startsWith("v1="))?.slice(3);
  if (!ts || !v1) return null;
  return { ts, v1 };
}

/**
 * Manifesto assinado pelo Mercado Pago:
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 */
export function buildMercadoPagoManifest(params: {
  dataId: string;
  requestId: string | null;
  ts: string;
}): string {
  return `id:${params.dataId};request-id:${params.requestId ?? ""};ts:${params.ts};`;
}

export function verifyMercadoPagoSignature(params: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string;
  secret: string;
}): boolean {
  const parsed = parseMercadoPagoSignature(params.signatureHeader);
  if (!parsed || !params.dataId) return false;
  const manifest = buildMercadoPagoManifest({
    dataId: params.dataId,
    requestId: params.requestId,
    ts: parsed.ts,
  });
  return safeEqualHex(
    parsed.v1,
    hmacSha256Hex(params.secret, manifest),
  );
}
