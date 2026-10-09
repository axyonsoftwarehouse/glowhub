export type ProductActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialProductActionState: ProductActionState = { status: "idle" };

export type ProductKind = "resale" | "internal";

export type ProductVariant = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  priceCents: number;
  costCents: number;
  stockQuantity: number;
  minStock: number;
  isActive: boolean;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  kind: ProductKind;
  isActive: boolean;
  variants: ProductVariant[];
};

export type CategoryOption = {
  id: string;
  name: string;
};
