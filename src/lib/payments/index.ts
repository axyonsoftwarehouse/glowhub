import { mercadoPagoProvider } from "./mercadopago";
import { mockProvider } from "./mock";
import type { PaymentProviderAdapter } from "./types";

const ADAPTERS: Record<string, PaymentProviderAdapter> = {
  mock: mockProvider,
  mercadopago: mercadoPagoProvider,
};

export function getPaymentProvider(
  id: string,
): PaymentProviderAdapter | null {
  return ADAPTERS[id] ?? null;
}

/** Provedor ativo conforme `PAYMENT_PROVIDER` (padrao `mock`). */
export function activePaymentProviderId(): string {
  return process.env.PAYMENT_PROVIDER ?? "mock";
}

export function activePaymentProvider(): PaymentProviderAdapter {
  return getPaymentProvider(activePaymentProviderId()) ?? mockProvider;
}

export { mercadoPagoProvider, mockProvider };
export * from "./types";
