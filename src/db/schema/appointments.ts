import {
  bigint,
  boolean,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { services } from "./catalog";
import { professionals } from "./professionals";
import { branches, tenants } from "./tenancy";

export const appointmentStatus = pgEnum("appointment_status", [
  "pending",
  "confirmed",
  "check_in",
  "checkout",
  "completed",
  "cancelled",
  "no_show",
]);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    birthday: date("birthday"),
    tags: text("tags").array(),
    preferences: text("preferences"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("clients_tenant_idx").on(t.tenantId),
    index("clients_tags_idx").using("gin", t.tags),
  ],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: appointmentStatus("status").notNull().default("pending"),
    priceCents: bigint("price_cents", { mode: "number" }).notNull().default(0),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appointments_tenant_idx").on(t.tenantId),
    index("appointments_branch_idx").on(t.branchId),
    index("appointments_professional_idx").on(t.professionalId),
    index("appointments_client_idx").on(t.clientId),
    index("appointments_starts_at_idx").on(t.startsAt),
  ],
);
