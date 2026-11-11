import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Registro de aceite dos documentos legais (Termos de Uso e Politica de
 * Privacidade). Append-only: cada aceite de uma versao gera uma linha, o que
 * guarda o historico exigido pela LGPD (quem, o que, quando, de onde). Tabela
 * interna: lida/escrita apenas pela conexao admin (role revogada em db/rls.sql).
 */
export const legalAcceptances = pgTable(
  "legal_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    document: text("document").notNull(),
    version: text("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (table) => [index("legal_acceptances_user_idx").on(table.userId, table.document)],
);
