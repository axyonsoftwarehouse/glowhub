export type AppointmentActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialAppointmentActionState: AppointmentActionState = {
  status: "idle",
};

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "check_in"
  | "checkout"
  | "completed"
  | "cancelled"
  | "no_show";

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  check_in: "Check-in",
  checkout: "Checkout",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

export const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "cancelled", "no_show"],
  confirmed: ["check_in", "cancelled", "no_show"],
  check_in: ["checkout", "cancelled"],
  checkout: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export type BranchOption = {
  id: string;
  name: string;
  timezone: string;
};

export type ProfessionalOption = {
  id: string;
  name: string;
  branchIds: string[];
  serviceIds: string[];
};

export type ServiceOption = {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
};

export type ClientOption = {
  id: string;
  name: string;
};

export type Appointment = {
  id: string;
  branchId: string;
  branchName: string;
  professionalName: string;
  serviceName: string;
  clientName: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  priceCents: number;
};
