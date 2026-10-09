export type InventoryActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialInventoryActionState: InventoryActionState = {
  status: "idle",
};

export type InventoryVariantOption = {
  variantId: string;
  label: string;
  unit: string;
  stockQuantity: number;
  costCents: number;
};

export type InventoryMovementRow = {
  id: string;
  kind: string;
  quantityDelta: number;
  unitCostCents: number;
  label: string;
  unit: string;
  supplierName: string | null;
  notes: string | null;
  createdAt: Date;
};

export type SupplierRow = {
  id: string;
  name: string;
  contact: string | null;
  isActive: boolean;
};
