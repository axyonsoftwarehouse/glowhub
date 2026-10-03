export type CouponActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialCouponActionState: CouponActionState = { status: "idle" };

export type Coupon = {
  id: string;
  code: string;
  description: string | null;
  discountType: "percent" | "fixed";
  discountValue: number;
  minAmountCents: number;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
};
