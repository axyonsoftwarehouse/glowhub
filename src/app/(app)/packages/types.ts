export type PackageActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialPackageActionState: PackageActionState = { status: "idle" };

export type PackageItem = {
  serviceId: string;
  serviceName: string;
  quantity: number;
  redeemed: number;
};

export type PackageTemplate = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  validityDays: number | null;
  isActive: boolean;
  items: PackageItem[];
};

export type ServiceOption = { id: string; name: string; priceCents: number };
export type ClientOption = { id: string; name: string };

export type SoldPackage = {
  id: string;
  clientName: string;
  packageName: string;
  status: "active" | "used" | "expired" | "cancelled";
  expiresAt: string | null;
  items: PackageItem[];
};

export type SoldPackageRaw = {
  id: string;
  clientId: string;
  packageId: string;
  status: "active" | "used" | "expired" | "cancelled";
  expiresAt: Date | null;
};
