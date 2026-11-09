import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Pacote mobile solo", () => {
  test("mostra a navegação inferior e o menu Mais", async ({ page }) => {
    await page.goto("/dashboard");

    const nav = page.getByRole("navigation", { name: "Navegação mobile" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Hoje" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Agenda" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Clientes" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Mais" })).toBeVisible();

    await page.getByRole("button", { name: "Mais" }).click();
    const drawer = page.getByRole("dialog", { name: "Todos os módulos" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Serviços" })).toBeVisible();

    await drawer.getByRole("link", { name: "Serviços" }).click();
    await page.waitForURL("**/services");
    await expect(
      page.getByRole("heading", { name: "Serviços", level: 1 }),
    ).toBeVisible();
  });
});
