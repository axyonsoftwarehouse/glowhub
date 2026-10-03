export type TenantActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialTenantActionState: TenantActionState = { status: "idle" };
