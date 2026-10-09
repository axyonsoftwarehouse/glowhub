import type { ClientSegment } from "@/lib/crm";

export type ClientActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialClientActionState: ClientActionState = { status: "idle" };

export type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birthday: string | null;
  tags: string[] | null;
  preferences: string | null;
  marketingOptIn: boolean;
  notes: string | null;
  isActive: boolean;
};

export type ClientInsights = {
  segment: ClientSegment;
  isVip: boolean;
  visits: number;
  totalSpentCents: number;
  averageTicketCents: number;
  daysSinceLastVisit: number | null;
  frequencyDays: number | null;
};

export type ClientWithInsights = Client & { insights: ClientInsights };

export type ClientSegmentFilter =
  | ClientSegment
  | "vip"
  | "aniversariantes"
  | "todas";
