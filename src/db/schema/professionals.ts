import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { services } from "./catalog";
import { branches, tenants } from "./tenancy";

export const professionals = pgTable(
  "professionals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    commissionBp: integer("commission_bp").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("professionals_tenant_idx").on(t.tenantId),
    index("professionals_user_idx").on(t.userId),
    uniqueIndex("professionals_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`),
    check("professionals_commission_range", sql`${t.commissionBp} between 0 and 10000`),
  ],
);

export const professionalBranches = pgTable(
  "professional_branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("professional_branches_professional_branch_key").on(
      t.professionalId,
      t.branchId,
    ),
    index("professional_branches_tenant_idx").on(t.tenantId),
    index("professional_branches_branch_idx").on(t.branchId),
  ],
);

export const professionalServices = pgTable(
  "professional_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("professional_services_professional_service_key").on(
      t.professionalId,
      t.serviceId,
    ),
    index("professional_services_tenant_idx").on(t.tenantId),
    index("professional_services_service_idx").on(t.serviceId),
  ],
);
