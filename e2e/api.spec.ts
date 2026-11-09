import { test, expect } from "@playwright/test";

const TENANT = { "x-tenant-slug": "demo" };

test.describe("API v1 pública", () => {
  test("lista tenant e catálogo do demo", async ({ request }) => {
    const response = await request.get("/api/v1/public/catalog", {
      headers: TENANT,
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.tenant.slug).toBe("demo");
    expect(body.tenant.name).toBeTruthy();
    expect(Array.isArray(body.services)).toBe(true);
    expect(Array.isArray(body.professionals)).toBe(true);
    expect(body.services.length).toBeGreaterThan(0);
    expect(body.branches.length).toBeGreaterThan(0);
  });

  test("calcula a disponibilidade de um serviço", async ({ request }) => {
    const catalog = await request.get("/api/v1/public/catalog", {
      headers: TENANT,
    });
    const body = await catalog.json();

    const service = body.services[0];
    const professional = body.professionals.find(
      (item: { serviceIds: string[]; branchIds: string[] }) =>
        item.serviceIds.includes(service.id) && item.branchIds.length > 0,
    );
    expect(professional, "profissional vinculado ao serviço").toBeTruthy();

    const date = new Date(Date.now() + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const params = new URLSearchParams({
      branchId: professional.branchIds[0],
      professionalId: professional.id,
      serviceId: service.id,
      date,
    });
    const response = await request.get(
      `/api/v1/public/availability?${params.toString()}`,
      { headers: TENANT },
    );
    expect(response.status()).toBe(200);

    const availability = await response.json();
    expect(availability.date).toBe(date);
    expect(Array.isArray(availability.slots)).toBe(true);
    expect(availability.durationMinutes).toBeGreaterThan(0);
  });
});
