export type ReconcileState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialReconcileState: ReconcileState = { status: "idle" };

export type ChargeRow = {
  id: string;
  clientName: string;
  description: string;
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  status: "open" | "paid" | "void";
  reconciled: boolean;
};

export type PaymentRow = {
  id: string;
  chargeDescription: string;
  method: string;
  amountCents: number;
  status: "pending" | "confirmed" | "failed" | "refunded";
  provider: string | null;
  providerRef: string | null;
};
