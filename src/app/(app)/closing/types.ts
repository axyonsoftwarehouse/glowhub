export type ClosingActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialClosingActionState: ClosingActionState = { status: "idle" };

export type ClosingSummary = {
  revenue: number;
  expense: number;
  result: number;
};

export type ClosingPeriod = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: "open" | "closed";
  closedAt: string | null;
  summary: ClosingSummary | null;
};
