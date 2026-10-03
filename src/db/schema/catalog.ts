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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { branches, tenants } from "./tenancy";

export const categoryKind = pgEnum("category_kind", ["service", "product"]);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "cascade",
    }),
    kind: categoryKind("kind").notNull().default("service"),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("categories_tenant_idx").on(t.tenantId),
    index("categories_parent_idx").on(t.parentId),
    uniqueIndex("categories_root_name_key")
      .on(t.tenantId, t.kind, sql`lower(${t.name})`)
      .where(sql`${t.parentId} is null`),
    uniqueIndex("categories_child_name_key")
      .on(t.tenantId, t.parentId, sql`lower(${t.name})`)
      .where(sql`${t.parentId} is not null`),
  ],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    priceCents: bigint("price_cents", { mode: "number" }).notNull().default(0),
    imageUrl: text("image_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("services_tenant_idx").on(t.tenantId),
    index("services_category_idx").on(t.categoryId),
    uniqueIndex("services_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`),
    check("services_duration_positive", sql`${t.durationMinutes} > 0`),
    check("services_price_non_negative", sql`${t.priceCents} >= 0`),
  ],
);

export const serviceBranches = pgTable(
  "service_branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    priceCents: bigint("price_cents", { mode: "number" }),
    durationMinutes: integer("duration_minutes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("service_branches_service_branch_key").on(t.serviceId, t.branchId),
    index("service_branches_tenant_idx").on(t.tenantId),
    index("service_branches_branch_idx").on(t.branchId),
    check(
      "service_branches_price_non_negative",
      sql`${t.priceCents} is null or ${t.priceCents} >= 0`,
    ),
    check(
      "service_branches_duration_positive",
      sql`${t.durationMinutes} is null or ${t.durationMinutes} > 0`,
    ),
  ],
);
