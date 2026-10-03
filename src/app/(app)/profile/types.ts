export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialProfileActionState: ProfileActionState = { status: "idle" };

export type Profile = {
  fullName: string | null;
  avatarUrl: string | null;
  timezone: string;
  emailNotifications: boolean;
};
