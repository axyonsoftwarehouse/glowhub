import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/db";
import * as schema from "@/db/schema";

type Auth = ReturnType<typeof buildAuth>;

function buildAuth() {
  const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins,
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    plugins: [nextCookies()],
  });
}

let cached: Auth | undefined;

/**
 * Instancia o Better Auth sob demanda. A construcao toca o banco (getDb), entao
 * e adiada para o primeiro uso — assim o build/preview nao exige DATABASE_URL.
 */
function resolveAuth(): Auth {
  if (!cached) cached = buildAuth();
  return cached;
}

export const auth = new Proxy({} as Auth, {
  get(_target, property) {
    const instance = resolveAuth();
    const value = Reflect.get(instance as object, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export type Session = typeof auth.$Infer.Session;
