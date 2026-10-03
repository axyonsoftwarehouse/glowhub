export type ProfessionalActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialProfessionalActionState: ProfessionalActionState = {
  status: "idle",
};

export type Professional = {
  id: string;
  name: string;
  commissionBp: number;
  isActive: boolean;
  branchIds: string[];
  serviceIds: string[];
};

export type BranchOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export type ServiceOption = {
  id: string;
  name: string;
  isActive: boolean;
};
