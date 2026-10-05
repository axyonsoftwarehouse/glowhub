import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test as setup, expect } from "@playwright/test";

const authFile = join(process.cwd(), "e2e", ".auth", "demo.json");

// Faz login pela conta demo e reaproveita a sessão nos testes (storageState).
setup("login com a conta demo", async ({ page }) => {
  await page.goto("/login");

  const demoButton = page.getByRole("button", {
    name: "Entrar com conta demo",
  });
  await expect(demoButton).toBeVisible();
  await demoButton.click();

  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Encanto Studio",
  );

  mkdirSync(dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
