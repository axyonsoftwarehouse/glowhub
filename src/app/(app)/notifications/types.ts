export type NotificationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialNotificationActionState: NotificationActionState = {
  status: "idle",
};

export type Notification = {
  id: string;
  channel: string;
  recipient: string;
  subject: string;
  status: "pending" | "sent" | "failed";
  error: string | null;
  createdAt: string;
};
