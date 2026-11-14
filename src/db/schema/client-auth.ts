import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";

/**
 * Codigos OTP do cliente final. Guardamos apenas o hash HMAC do codigo; o
 * e-mail e a identidade do cliente dentro do tenant.
 */
export const clientOtpCodes = pgTable(
  "client_otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("client_otp_codes_tenant_email_idx").on(t.tenantId, t.email),
    index("client_otp_codes_expires_idx").on(t.expiresAt),
  ],
);

/**
 * Sessao do cliente final no app. O token Bearer e devolvido uma unica vez e
 * guardado apenas como hash SHA-256.
 */
export const clientSessions = pgTable(
  "client_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("client_sessions_token_hash_key").on(t.tokenHash),
    index("client_sessions_tenant_email_idx").on(t.tenantId, t.email),
    index("client_sessions_expires_idx").on(t.expiresAt),
  ],
);
