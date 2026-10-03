export type TeamActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialTeamActionState: TeamActionState = { status: "idle" };

export const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gerente",
  staff: "Profissional",
  viewer: "Visualizador",
};

export const INVITE_ROLES = [
  { value: "admin", label: ROLE_LABELS.admin },
  { value: "manager", label: ROLE_LABELS.manager },
  { value: "staff", label: ROLE_LABELS.staff },
  { value: "viewer", label: ROLE_LABELS.viewer },
] as const;

export type Member = {
  userId: string;
  role: string;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
};
