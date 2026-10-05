import { test, expect } from "@playwright/test";

test.describe("Fechamento contábil", () => {
  test("a página carrega o formulário de fechamento", async ({ page }) => {
    await page.goto("/closing");

    await expect(
      page.getByRole("heading", { name: "Fechamento contábil", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Fechar período" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Fechar período" }),
    ).toBeVisible();
  });
});
