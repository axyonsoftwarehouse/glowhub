import { test, expect } from "@playwright/test";

test.describe("Clientes e histórico", () => {
  test("abre o histórico dedicado do cliente a partir da lista", async ({
    page,
  }) => {
    await page.goto("/clients");
    await expect(
      page.getByRole("heading", { name: "Clientes", level: 1 }),
    ).toBeVisible();

    const firstClientLink = page.locator("article h3 a").first();
    await expect(firstClientLink).toBeVisible();
    const clientName = (await firstClientLink.textContent())?.trim() ?? "";
    await firstClientLink.click();

    await page.waitForURL("**/clients/**");
    await expect(
      page.getByRole("heading", { name: clientName, level: 1 }),
    ).toBeVisible();

    await expect(page.getByText("Saldo na carteira")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Atendimentos" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cobranças e pagamentos" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Carteira (crédito pré-pago)" }),
    ).toBeVisible();
  });
});
