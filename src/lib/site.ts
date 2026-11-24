// URL publica do site (metadataBase, sitemap e robots). Sem
// NEXT_PUBLIC_APP_URL cai no BETTER_AUTH_URL e, por fim, em localhost.
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export const SITE_NAME = "GlowHub";
export const SITE_DESCRIPTION =
  "Agenda, agendamento online, comandas, clientes e financeiro para salões, barbearias, clínicas de estética e spas.";
