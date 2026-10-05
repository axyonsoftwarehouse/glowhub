export type SubscriptionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialSubscriptionActionState: SubscriptionActionState = {
  status: "idle",
};

export type PlanItem = {
  serviceId: string;
  serviceName: string;
  quantityPerPeriod: number;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  interval: "month" | "year";
  isActive: boolean;
  items: PlanItem[];
};

export type ServiceOption = { id: string; name: string };
export type ClientOption = { id: string; name: string };

export type SubscriptionUsage = {
  serviceId: string;
  serviceName: string;
  limit: number;
  used: number;
};

export type ClientSubscription = {
  id: string;
  clientName: string;
  planName: string;
  status: "active" | "cancelled" | "past_due";
  priceCents: number;
  interval: "month" | "year";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  usage: SubscriptionUsage[];
};
