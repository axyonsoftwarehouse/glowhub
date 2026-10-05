import { test, expect } from "@playwright/test";

const ACTION_TO_STATUS: Record<string, string> = {
  Reabrir: "Pendente",
  Confirmar: "Confirmado",
  "Check-in": "Check-in",
  Checkout: "Checkout",
  Concluir: "Concluído",
  Cancelar: "Cancelado",
  "Não compareceu": "Não compareceu",
};

test.describe("Minha agenda (visão do profissional)", () => {
  test("o vínculo profissional habilita a página e lista a própria agenda", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const navLink = page.getByRole("link", { name: "Minha agenda" });
    await expect(navLink).toBeVisible();
    await navLink.click();

    await page.waitForURL("**/my-schedule");
    await expect(
      page.getByRole("heading", { name: "Minha agenda", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("atendimento(s)")).toBeVisible();
  });

  test("o profissional altera o status de um atendimento próprio", async ({
    page,
  }) => {
    // Visão semanal: cobre os atendimentos futuros de qualquer profissional.
    await page.goto("/my-schedule?range=week");
    await expect(
      page.getByRole("heading", { name: "Minha agenda", level: 1 }),
    ).toBeVisible();

    const cards = page.locator("article").filter({
      has: page.getByRole("button"),
    });

    if ((await cards.count()) === 0) {
      test.skip(
        true,
        "Sem atendimentos acionáveis na data de hoje (rode npm run seed:demo).",
      );
      return;
    }

    const card = cards.first();
    // Referência estável: o card pode deixar de ter botões após a transição
    // (ex.: "Concluir" -> sem próximas ações), então localizamos por texto.
    const headerText = await card.locator("p").first().innerText();
    const actionButton = card.getByRole("button").first();
    const action = ((await actionButton.textContent()) ?? "").trim();
    const expectedStatus = ACTION_TO_STATUS[action];
    expect(expectedStatus, `ação desconhecida: ${action}`).toBeTruthy();

    await actionButton.click();

    const stableCard = page.locator("article").filter({ hasText: headerText });
    await expect(
      stableCard.getByText(expectedStatus, { exact: true }),
    ).toBeVisible();
  });
});
