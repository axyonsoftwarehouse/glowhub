export type LoyaltyActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialLoyaltyActionState: LoyaltyActionState = { status: "idle" };

export type ClientOption = {
  id: string;
  name: string;
};

export type GiftCardRow = {
  id: string;
  code: string;
  initialValueCents: number;
  balanceCents: number;
  status: "active" | "redeemed" | "cancelled";
  expiresAt: string | null;
  clientName: string | null;
};

export type LoyaltySettingsView = {
  isActive: boolean;
  pointsPerReal: number;
  redeemPointsPerReal: number;
};

export type PointsBalanceRow = {
  clientId: string;
  clientName: string;
  balance: number;
};

export type CampaignRow = {
  id: string;
  name: string;
  segment: string;
  subject: string;
  audienceCount: number;
  sentCount: number;
  createdAt: string;
};
