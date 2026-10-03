export type CatalogActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialCatalogActionState: CatalogActionState = { status: "idle" };

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  categoryId: string | null;
  imageUrl: string | null;
  isActive: boolean;
};

export type BranchOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export type ServiceBranchOverride = {
  branchId: string;
  priceCents: number | null;
  durationMinutes: number | null;
  isActive: boolean;
};
