import { test, expect } from "@playwright/test";

test.describe("Assinaturas (recorrência e consumo)", () => {
  test("lista a assinatura com o consumo do período", async ({ page }) => {
    await page.goto("/subscriptions");

    await expect(
      page.getByRole("heading", { name: "Assinaturas", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Clube Cabelo · Camila Dias")).toBeVisible();
    // Seed: 1 de 2 resgates em cada serviço no período atual.
    await expect(page.getByText("1/2").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Faturar vencidas" }),
    ).toBeVisible();
  });
});
