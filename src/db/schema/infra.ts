import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Contador de rate limiting por chave (fixed window). Tabela interna:
 * lida/escrita apenas pela conexao admin (role revogada em db/rls.sql).
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true })
    .notNull()
    .defaultNow(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
