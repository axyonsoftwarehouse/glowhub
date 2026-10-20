// Baseline: marca a migration 0000 como ja aplicada num banco que ja tem o
// schema (criado antes das migrations versionadas, via drizzle-kit push).
// Nao executa SQL de schema. Idempotente. Depois dele, rode `npm run db:migrate`
// para aplicar as migrations seguintes.
// Rodar: npm run db:baseline  (ou node --env-file=<arquivo> scripts/baseline.mjs)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL nao definido.");
  process.exit(1);
}

const migrationsFolder = "./drizzle";
const [first] = JSON.parse(
  readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8"),
).entries;
// Mesmo calculo do migrator do drizzle-orm (readMigrationFiles).
const hash = createHash("sha256")
  .update(readFileSync(`${migrationsFolder}/${first.tag}.sql`).toString())
  .digest("hex");

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

try {
  console.log(`Banco: ${new URL(url).host}`);

  const [state] = await sql`select to_regclass('public.tenants') is not null as has_tables`;
  if (!state.has_tables) {
    console.error("Banco vazio: use `npm run db:migrate` em vez do baseline.");
    process.exitCode = 1;
  } else {
    await sql`create schema if not exists drizzle`;
    await sql`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )`;
    const existing = await sql`
      select id from drizzle.__drizzle_migrations where created_at = ${first.when}`;
    if (existing.length > 0) {
      console.log(`${first.tag} já está marcada como aplicada.`);
    } else {
      await sql`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${hash}, ${first.when})`;
      console.log(`${first.tag} marcada como aplicada (baseline).`);
    }
  }
} finally {
  await sql.end();
}
