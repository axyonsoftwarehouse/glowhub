import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  DATABASE_AUTHENTICATED_URL: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().optional(),
  DEFAULT_TENANT_SLUG: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    cached = envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_AUTHENTICATED_URL: process.env.DATABASE_AUTHENTICATED_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
      DEFAULT_TENANT_SLUG: process.env.DEFAULT_TENANT_SLUG,
    });
  }
  return cached;
}

export function isConfigured(): boolean {
  const env = getEnv();
  return Boolean(
    env.DATABASE_URL &&
      env.DATABASE_AUTHENTICATED_URL &&
      env.BETTER_AUTH_SECRET,
  );
}

