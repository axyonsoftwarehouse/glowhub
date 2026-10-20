// Aplica as migrations pendentes (drizzle/) e reaplica o db/rls.sql
// (idempotente: funcoes, policies, triggers e grants).
// Rodar: npm run db:migrate  (ou node --env-file=<arquivo> scripts/migrate.mjs)
//
// Banco que ja tem tabelas mas nunca recebeu baseline e recusado: rode
// `npm run db:baseline` antes (ver scripts/baseline.mjs).

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL nao definido.");
  process.exit(1);
}

// Overrides so para validar migrations em banco temporario.
const migrationsFolder = process.env.MIGRATIONS_DIR ?? "./drizzle";
const rlsFile = process.env.RLS_FILE ?? "db/rls.sql";

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

try {
  console.log(`Banco: ${new URL(url).host}`);

  const [state] = await sql`
    select
      to_regclass('public.tenants') is not null as has_tables,
      to_regclass('drizzle.__drizzle_migrations') is not null as has_journal`;
  if (state.has_tables && !state.has_journal) {
    console.error(
      "Banco já tem tabelas mas não tem baseline. Rode `npm run db:baseline`.",
    );
    process.exitCode = 1;
  } else {
    const before = state.has_journal
      ? (await sql`select count(*)::int as n from drizzle.__drizzle_migrations`)[0].n
      : 0;

    await migrate(drizzle(sql), { migrationsFolder });

    const applied = await sql`
      select id, created_at from drizzle.__drizzle_migrations order by created_at`;
    const journal = JSON.parse(
      readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8"),
    ).entries;
    const tagOf = (createdAt) =>
      journal.find((e) => e.when === Number(createdAt))?.tag ?? `? (${createdAt})`;
    const fresh = applied.slice(before);
    console.log(
      fresh.length > 0
        ? `Migrations aplicadas: ${fresh.map((m) => tagOf(m.created_at)).join(", ")}`
        : "Nenhuma migration pendente.",
    );

    await sql.unsafe(readFileSync(rlsFile, "utf8"));
    console.log(`SQL aplicado: ${rlsFile}`);
  }
} finally {
  await sql.end();
}
