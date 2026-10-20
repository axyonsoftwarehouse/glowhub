// Ambiente da aplicacao (APP_ENV): demo (vitrine), dev (local/e2e/preview) ou
// production. Ausente ou desconhecido = production, o padrao mais seguro: a
// conta demo fica desligada.

export type AppEnv = "demo" | "dev" | "production";

type Env = Record<string, string | undefined>;

const APP_ENVS: readonly AppEnv[] = ["demo", "dev", "production"];

export function getAppEnv(env: Env = process.env): AppEnv {
  const value = env.APP_ENV;
  return APP_ENVS.includes(value as AppEnv) ? (value as AppEnv) : "production";
}

/**
 * Login demo so em demo/dev, com `NEXT_PUBLIC_DEMO_LOGIN=true` e
 * `DEMO_PASSWORD` definido. Assim copiar as duas variaveis para a producao
 * nao liga a demo por engano.
 */
export function isDemoLoginEnabled(env: Env = process.env): boolean {
  const appEnv = getAppEnv(env);
  return (
    (appEnv === "demo" || appEnv === "dev") &&
    env.NEXT_PUBLIC_DEMO_LOGIN === "true" &&
    Boolean(env.DEMO_PASSWORD)
  );
}
