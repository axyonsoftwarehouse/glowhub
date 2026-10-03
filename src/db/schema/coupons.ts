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
import { clients } from "./appointments";
import { charges, journalEntries } from "./ledger";
import { tenants } from "./tenancy";

export const discountType = pgEnum("discount_type", ["percent", "fixed"]);

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    description: text("description"),
    discountType: discountType("discount_type").notNull(),
    discountValue: bigint("discount_value", { mode: "number" }).notNull(),
    minAmountCents: bigint("min_amount_cents", { mode: "number" }).notNull().default(0),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("coupons_tenant_code_key").on(t.tenantId, sql`lower(${t.code})`),
    index("coupons_tenant_idx").on(t.tenantId),
    check("coupons_discount_positive", sql`${t.discountValue} > 0`),
    check(
      "coupons_percent_range",
      sql`${t.discountType} <> 'percent' or ${t.discountValue} <= 10000`,
    ),
    check("coupons_min_amount_non_negative", sql`${t.minAmountCents} >= 0`),
    check("coupons_used_count_non_negative", sql`${t.usedCount} >= 0`),
  ],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id").references(() => charges.id, {
      onDelete: "set null",
    }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    entryId: uuid("entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("coupon_redemptions_tenant_idx").on(t.tenantId),
    index("coupon_redemptions_coupon_idx").on(t.couponId),
    check("coupon_redemptions_amount_positive", sql`${t.amountCents} > 0`),
  ],
);
