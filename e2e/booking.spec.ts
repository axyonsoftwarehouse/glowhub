import { test, expect } from "@playwright/test";

test.describe("Agendamento online (canal público)", () => {
  test("a página pública de agendamento carrega o catálogo do tenant", async ({
    page,
  }) => {
    await page.goto("/book");

    await expect(page.getByText("Agendamento online")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Encanto Studio" }),
    ).toBeVisible();
    await expect(page.getByText("Escolha o serviço")).toBeVisible();
  });
});
