export type Branch = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  timezone: string;
  isActive: boolean;
};

export type BranchActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialBranchActionState: BranchActionState = { status: "idle" };

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
