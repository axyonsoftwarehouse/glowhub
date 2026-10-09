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
import { categories } from "./catalog";
import { tenants } from "./tenancy";

export const productKind = pgEnum("product_kind", ["resale", "internal"]);

export const products = pgTable(
  "products",
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
    imageUrl: text("image_url"),
    kind: productKind("kind").notNull().default("resale"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_tenant_idx").on(t.tenantId),
    index("products_category_idx").on(t.categoryId),
    uniqueIndex("products_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sku: text("sku"),
    unit: text("unit").notNull().default("un"),
    priceCents: bigint("price_cents", { mode: "number" }).notNull().default(0),
    costCents: bigint("cost_cents", { mode: "number" }).notNull().default(0),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    minStock: integer("min_stock").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_variants_tenant_idx").on(t.tenantId),
    index("product_variants_product_idx").on(t.productId),
    uniqueIndex("product_variants_product_name_key").on(
      t.productId,
      sql`lower(${t.name})`,
    ),
    uniqueIndex("product_variants_sku_key")
      .on(t.tenantId, sql`lower(${t.sku})`)
      .where(sql`${t.sku} is not null`),
    check("product_variants_price_non_negative", sql`${t.priceCents} >= 0`),
    check("product_variants_cost_non_negative", sql`${t.costCents} >= 0`),
    check("product_variants_min_stock_non_negative", sql`${t.minStock} >= 0`),
  ],
);
