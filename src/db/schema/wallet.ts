import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./appointments";
import { journalEntries } from "./ledger";
import { tenants } from "./tenancy";

export const walletTxKind = pgEnum("wallet_tx_kind", [
  "topup",
  "payment",
  "adjustment",
]);

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    kind: walletTxKind("kind").notNull(),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    entryId: uuid("entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("wallet_transactions_tenant_idx").on(t.tenantId),
    index("wallet_transactions_client_idx").on(t.clientId),
    check("wallet_transactions_amount_nonzero", sql`${t.amountCents} <> 0`),
  ],
);
