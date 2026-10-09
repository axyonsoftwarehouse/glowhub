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
import { services } from "./catalog";
import { productVariants } from "./products";
import { tenants } from "./tenancy";

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contact: text("contact"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("suppliers_tenant_idx").on(t.tenantId),
    uniqueIndex("suppliers_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`),
  ],
);

export const stockMovementKind = pgEnum("stock_movement_kind", [
  "purchase",
  "sale",
  "sale_return",
  "service_consumption",
  "adjustment",
  "loss",
  "opening",
]);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    kind: stockMovementKind("kind").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    unitCostCents: bigint("unit_cost_cents", { mode: "number" })
      .notNull()
      .default(0),
    supplierId: uuid("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stock_movements_tenant_idx").on(t.tenantId),
    index("stock_movements_variant_idx").on(t.variantId),
    check("stock_movements_quantity_non_zero", sql`${t.quantityDelta} <> 0`),
    check("stock_movements_cost_non_negative", sql`${t.unitCostCents} >= 0`),
    uniqueIndex("stock_movements_reference_key")
      .on(t.tenantId, t.referenceType, t.referenceId, t.variantId, t.kind)
      .where(sql`${t.referenceId} is not null`),
  ],
);

export const serviceMaterials = pgTable(
  "service_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("service_materials_tenant_idx").on(t.tenantId),
    index("service_materials_service_idx").on(t.serviceId),
    uniqueIndex("service_materials_service_variant_key").on(
      t.serviceId,
      t.variantId,
    ),
    check("service_materials_quantity_positive", sql`${t.quantity} > 0`),
  ],
);
