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

export const giftCardStatus = pgEnum("gift_card_status", [
  "active",
  "redeemed",
  "cancelled",
]);

export const giftCards = pgTable(
  "gift_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    initialValueCents: bigint("initial_value_cents", { mode: "number" })
      .notNull(),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    status: giftCardStatus("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    entryId: uuid("entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gift_cards_tenant_code_key").on(t.tenantId, sql`lower(${t.code})`),
    index("gift_cards_tenant_idx").on(t.tenantId),
    index("gift_cards_client_idx").on(t.clientId),
    check("gift_cards_value_positive", sql`${t.initialValueCents} > 0`),
  ],
);

export const giftCardRedemptions = pgTable(
  "gift_card_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    giftCardId: uuid("gift_card_id")
      .notNull()
      .references(() => giftCards.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    chargeId: uuid("charge_id").references(() => charges.id, {
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
    index("gift_card_redemptions_tenant_idx").on(t.tenantId),
    index("gift_card_redemptions_card_idx").on(t.giftCardId),
    check("gift_card_redemptions_amount_positive", sql`${t.amountCents} > 0`),
  ],
);

export const loyaltySettings = pgTable(
  "loyalty_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),
    pointsPerReal: integer("points_per_real").notNull().default(1),
    redeemPointsPerReal: integer("redeem_points_per_real").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("loyalty_settings_tenant_key").on(t.tenantId),
    check("loyalty_settings_points_non_negative", sql`${t.pointsPerReal} >= 0`),
    check(
      "loyalty_settings_redeem_positive",
      sql`${t.redeemPointsPerReal} > 0`,
    ),
  ],
);

export const loyaltyPointKind = pgEnum("loyalty_point_kind", [
  "earn",
  "redeem",
  "adjustment",
]);

export const loyaltyPoints = pgTable(
  "loyalty_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    pointsDelta: integer("points_delta").notNull(),
    kind: loyaltyPointKind("kind").notNull(),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("loyalty_points_tenant_idx").on(t.tenantId),
    index("loyalty_points_client_idx").on(t.clientId),
    check("loyalty_points_delta_nonzero", sql`${t.pointsDelta} <> 0`),
    uniqueIndex("loyalty_points_reference_key")
      .on(t.tenantId, t.referenceType, t.referenceId, t.kind)
      .where(sql`${t.referenceId} is not null`),
  ],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    segment: text("segment").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    audienceCount: integer("audience_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("campaigns_tenant_idx").on(t.tenantId)],
);
