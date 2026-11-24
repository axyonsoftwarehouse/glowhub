import type { MetadataRoute } from "next";
import { getAppEnv } from "@/lib/app-env";
import { siteUrl } from "@/lib/site";

// Rotas privadas (painel, API, fluxos com token) nao entram em buscadores.
const PRIVATE_PREFIXES = [
  "/api/",
  "/monitoring",
  "/pay/",
  "/invite/",
  "/billing",
  "/aceite-termos",
  "/reset-password",
  "/verify-email",
  "/dashboard",
  "/appointments",
  "/assistant",
  "/branches",
  "/clients",
  "/closing",
  "/coupons",
  "/finance",
  "/helpers",
  "/inventory",
  "/loyalty",
  "/my-schedule",
  "/notifications",
  "/onboarding",
  "/packages",
  "/products",
  "/professionals",
  "/profile",
  "/reconciliation",
  "/reports",
  "/schedule",
  "/services",
  "/settings",
  "/subscriptions",
  "/team",
];

export default function robots(): MetadataRoute.Robots {
  // Ambientes de demo e dev nao devem ser indexados.
  if (getAppEnv() !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  const base = siteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PREFIXES },
    sitemap: `${base}/sitemap.xml`,
  };
}
