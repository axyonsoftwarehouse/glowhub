import { Pool, type PoolConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} nao configurado. Copie .env.example para .env.local.`);
  }
  return value;
}

function createPool(connectionString: string): Pool {
  const config: PoolConfig = { connectionString };
  return new Pool(config);
}

let adminPool: Pool | undefined;
let adminDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Conexao administrativa (role owner, ignora RLS).
 * Use apenas para auth (Better Auth), migrations e operacoes privilegiadas.
 */
export function getDb() {
  if (!adminDb) {
    adminPool = createPool(requireEnv("DATABASE_URL"));
    adminDb = drizzle(adminPool, { schema });
  }
  return adminDb;
}

let appPool: Pool | undefined;
let appDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

export type AppDb = NonNullable<typeof appDb>;
export type AppTx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

/**
 * Conexao do app (role sem BYPASSRLS). Queries rodam com RLS aplicada.
 * Injeta o id do usuario nos claims da transacao, para as policies.
 */
export async function withUser<T>(
  userId: string,
  callback: (tx: AppTx) => Promise<T>,
): Promise<T> {
  if (!appDb) {
    appPool = createPool(requireEnv("DATABASE_AUTHENTICATED_URL"));
    appDb = drizzle(appPool, { schema });
  }
  return appDb.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId });
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${claims}, true)`,
    );
    // Excecao de teste: com DEMO_READ_ONLY=false o guard de "somente leitura"
    // do tenant demo e desativado (ex.: preview/dev). Em producao (default) fica
    // ativo. Ver db/rls.sql (enforce_readonly_tenant).
    const demoReadOnly = process.env.DEMO_READ_ONLY === "false" ? "off" : "on";
    await tx.execute(
      sql`select set_config('app.demo_readonly', ${demoReadOnly}, true)`,
    );
    return callback(tx);
  });
}
