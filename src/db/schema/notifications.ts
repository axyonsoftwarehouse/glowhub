import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";

export const notificationChannel = pgEnum("notification_channel", [
  "email",
  "sms",
  "push",
]);

export const notificationStatus = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channel: notificationChannel("channel").notNull().default("email"),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: notificationStatus("status").notNull().default("pending"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    providerMessageId: text("provider_message_id"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_tenant_idx").on(t.tenantId),
    index("notifications_status_idx").on(t.status),
    index("notifications_created_idx").on(t.createdAt),
  ],
);
