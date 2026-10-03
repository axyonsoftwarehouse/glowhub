import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { appointments, clients } from "./appointments";
import { services } from "./catalog";
import { journalEntries } from "./ledger";
import { tenants } from "./tenancy";

export const clientPackageStatus = pgEnum("client_package_status", [
  "active",
  "used",
  "expired",
  "cancelled",
]);

export const packages = pgTable(
  "packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: bigint("price_cents", { mode: "number" }).notNull().default(0),
    validityDays: integer("validity_days"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("packages_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`),
    index("packages_tenant_idx").on(t.tenantId),
    check("packages_price_non_negative", sql`${t.priceCents} >= 0`),
    check("packages_validity_non_negative", sql`${t.validityDays} is null or ${t.validityDays} >= 0`),
  ],
);

export const packageItems = pgTable(
  "package_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => [
    index("package_items_package_idx").on(t.packageId),
    check("package_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

export const clientPackages = pgTable(
  "client_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "restrict" }),
    priceCents: bigint("price_cents", { mode: "number" }).notNull().default(0),
    status: clientPackageStatus("status").notNull().default("active"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    entryId: uuid("entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("client_packages_tenant_idx").on(t.tenantId),
    index("client_packages_client_idx").on(t.clientId),
    check("client_packages_price_non_negative", sql`${t.priceCents} >= 0`),
  ],
);

export const packageRedemptions = pgTable(
  "package_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientPackageId: uuid("client_package_id")
      .notNull()
      .references(() => clientPackages.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    entryId: uuid("entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by"),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("package_redemptions_tenant_idx").on(t.tenantId),
    index("package_redemptions_client_package_idx").on(t.clientPackageId),
  ],
);
