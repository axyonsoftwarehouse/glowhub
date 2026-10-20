// Trava do seed demo: ele apaga e recria os tenants demo, que no banco da
// vitrine (APP_ENV=demo) sao praticamente todos os dados.
//   dev  -> roda
//   demo -> so com --confirm-demo (reseed deliberado da vitrine)
//   resto/ausente -> recusa
export function assertSeedAllowed(appEnv, argv) {
  if (appEnv === "dev") return;
  if (appEnv === "demo") {
    if (argv.includes("--confirm-demo")) return;
    throw new Error(
      "APP_ENV=demo: este seed apaga e recria os dados da vitrine. " +
        "Para confirmar, rode novamente com --confirm-demo.",
    );
  }
  throw new Error(
    `Seed recusado: APP_ENV=${appEnv ?? "(ausente)"}. ` +
      "Use APP_ENV=dev (ou APP_ENV=demo com --confirm-demo).",
  );
}
