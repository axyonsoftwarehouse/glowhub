export type ProductActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialProductActionState: ProductActionState = { status: "idle" };

export type ProductVariant = {
  id: string;
  name: string;
  sku: string | null;
  priceCents: number;
  stockQuantity: number;
  isActive: boolean;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  isActive: boolean;
  variants: ProductVariant[];
};

export type CategoryOption = {
  id: string;
  name: string;
};
