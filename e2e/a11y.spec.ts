import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

const PAGES: { path: string; name: string }[] = [
  { path: "/login", name: "login" },
  { path: "/book", name: "booking público" },
  { path: "/dashboard", name: "dashboard" },
  { path: "/clients", name: "clientes" },
  { path: "/my-schedule?range=week", name: "minha agenda" },
  { path: "/subscriptions", name: "assinaturas" },
  { path: "/closing", name: "fechamento" },
];

for (const target of PAGES) {
  test(`acessibilidade: ${target.name}`, async ({ page }) => {
    await page.goto(target.path);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const summary = results.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map((node) => node.target.join(" "))
            .join(" | ")}`,
      )
      .join("\n");

    const ids = results.violations.map((violation) => violation.id);
    expect(ids, summary).toEqual([]);
  });
}
