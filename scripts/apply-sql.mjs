import { readFileSync } from "node:fs";
import postgres from "postgres";

const file = process.argv[2];
if (!file) {
  console.error("Uso: node --env-file=.env.local scripts/apply-sql.mjs <arquivo.sql>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL nao definido.");
  process.exit(1);
}

const content = readFileSync(file, "utf8");
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

try {
  await sql.unsafe(content);
  console.log(`SQL aplicado: ${file}`);
} finally {
  await sql.end();
}
