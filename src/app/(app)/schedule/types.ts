export type ScheduleActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialScheduleActionState: ScheduleActionState = {
  status: "idle",
};

export type WeeklyHoursEntry = {
  weekday: number;
  start: string;
  end: string;
};

export type ClosureItem = {
  id: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
};

export type BranchOption = {
  id: string;
  name: string;
};

export type ProfessionalOption = {
  id: string;
  name: string;
};

export type ServiceOption = {
  id: string;
  name: string;
  durationMinutes: number;
};
