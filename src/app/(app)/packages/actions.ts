"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  clientPackages,
  clients,
  packageItems,
  packageRedemptions,
  packages,
  services,
} from "@/db/schema";
import { withUser, type AppTx } from "@/lib/db";
import { getSystemAccountId, postEntry } from "@/lib/ledger";
import { parsePriceToCents } from "@/lib/money";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { PackageActionState } from "./types";

type PaymentMethod = "cash" | "debit" | "credit" | "pix" | "transfer" | "wallet" | "other";

const packagePayload = z.object({
  name: z.string().trim().min(2, "Informe ao menos 2 caracteres.").max(120),
  description: z.string().trim().max(1000).optional(),
  price: z.string().trim(),
  validityDays: z.string().trim().optional(),
  items: z
    .array(
      z.object({
        serviceId: z.string().uuid("Serviço inválido."),
        quantity: z.coerce.number().int().min(1).max(1000),
      }),
    )
    .min(1, "Inclua ao menos um serviço."),
});

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

function errorCode(cause: unknown): string | undefined {
  return (cause as { code?: string })?.code;
}

async function context() {
  const tenant = await getCurrentTenant();
  if (!tenant) return { error: "Empresa não resolvida." as const };
  const session = await getSession();
  if (!session?.user) return { error: "Sessão expirada." as const };
  return { tenant, userId: session.user.id };
}

export async function createPackageAction(payload: {
  name: string;
  description?: string;
  price: string;
  validityDays?: string;
  items: { serviceId: string; quantity: number }[];
}): Promise<PackageActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = packagePayload.safeParse(payload);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const priceCents = parsePriceToCents(parsed.data.price);
  if (priceCents === null) {
    return { status: "error", fieldErrors: { price: ["Preço inválido."] } };
  }
  let validityDays: number | null = null;
  if (parsed.data.validityDays && parsed.data.validityDays !== "") {
    const value = Number(parsed.data.validityDays);
    if (!Number.isInteger(value) || value < 0) {
      return { status: "error", fieldErrors: { validityDays: ["Validade inválida."] } };
    }
    validityDays = value;
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      const [pkg] = await tx
        .insert(packages)
        .values({
          tenantId: ctx.tenant.id,
          name: parsed.data.name,
          description:
            parsed.data.description && parsed.data.description.length > 0
              ? parsed.data.description
              : null,
          priceCents,
          validityDays,
        })
        .returning({ id: packages.id });

      await tx.insert(packageItems).values(
        parsed.data.items.map((item) => ({
          tenantId: ctx.tenant.id,
          packageId: pkg.id,
          serviceId: item.serviceId,
          quantity: item.quantity,
        })),
      );
    });
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", message: "Já existe um pacote com esse nome." };
    }
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite criar pacotes." };
    }
    return { status: "error", message: String(cause) };
  }

  revalidatePath("/packages");
  return { status: "success", message: "Pacote criado." };
}

export async function setPackageActiveAction(
  _prev: PackageActionState,
  formData: FormData,
): Promise<PackageActionState> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return { status: "error", message: "Pacote inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(packages)
        .set({ isActive })
        .where(and(eq(packages.id, id), eq(packages.tenantId, ctx.tenant.id)))
        .returning({ id: packages.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para alterar o pacote." };
    }
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }

  revalidatePath("/packages");
  return { status: "success" };
}

export async function sellPackageAction(
  _prev: PackageActionState,
  formData: FormData,
): Promise<PackageActionState> {
  const clientId = String(formData.get("clientId") ?? "");
  const packageId = String(formData.get("packageId") ?? "");
  const method = (String(formData.get("method") ?? "cash") || "cash") as PaymentMethod;
  if (!clientId || !packageId) {
    return { status: "error", message: "Selecione o cliente e o pacote." };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const result = await withUser(ctx.userId, async (tx) => {
      const [client] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenant.id)))
        .limit(1);
      const [pkg] = await tx
        .select({
          id: packages.id,
          name: packages.name,
          priceCents: packages.priceCents,
          validityDays: packages.validityDays,
        })
        .from(packages)
        .where(and(eq(packages.id, packageId), eq(packages.tenantId, ctx.tenant.id)))
        .limit(1);
      if (!client || !pkg) return { error: "Cliente ou pacote não encontrado." };

      const liability = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "liability_package",
      );
      const debitAccount = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        method === "cash" ? "cash" : "bank",
      );
      if (!liability || !debitAccount) {
        return { error: "Crie o plano de contas padrão em Financeiro." };
      }

      const expiresAt =
        pkg.validityDays != null
          ? new Date(Date.now() + pkg.validityDays * 24 * 60 * 60 * 1000)
          : null;

      const [sold] = await tx
        .insert(clientPackages)
        .values({
          tenantId: ctx.tenant.id,
          clientId,
          packageId,
          priceCents: pkg.priceCents,
          status: "active",
          expiresAt,
          createdBy: ctx.userId,
        })
        .returning({ id: clientPackages.id });

      const entryId = await postEntry(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        description: `Venda de pacote: ${pkg.name}`,
        idempotencyKey: `package-sale-${sold.id}`,
        referenceType: "client_package",
        referenceId: sold.id,
        lines: [
          { accountId: debitAccount, direction: "debit", amountCents: pkg.priceCents },
          { accountId: liability, direction: "credit", amountCents: pkg.priceCents },
        ],
      });

      await tx
        .update(clientPackages)
        .set({ entryId })
        .where(eq(clientPackages.id, sold.id));

      return { ok: true as const };
    });

    if ("error" in result) return { status: "error", message: result.error };
    revalidatePath("/packages");
    revalidatePath("/finance");
    return { status: "success", message: "Pacote vendido." };
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }
}

async function remainingForService(
  tx: AppTx,
  tenantId: string,
  clientPackageId: string,
  serviceId: string,
): Promise<number> {
  const [item] = await tx
    .select({ quantity: packageItems.quantity })
    .from(packageItems)
    .innerJoin(clientPackages, eq(clientPackages.packageId, packageItems.packageId))
    .where(
      and(
        eq(packageItems.tenantId, tenantId),
        eq(clientPackages.id, clientPackageId),
        eq(packageItems.serviceId, serviceId),
      ),
    )
    .limit(1);
  if (!item) return 0;

  const used = await tx
    .select({ id: packageRedemptions.id })
    .from(packageRedemptions)
    .where(
      and(
        eq(packageRedemptions.tenantId, tenantId),
        eq(packageRedemptions.clientPackageId, clientPackageId),
        eq(packageRedemptions.serviceId, serviceId),
      ),
    );
  return item.quantity - used.length;
}

export async function redeemPackageServiceAction(
  _prev: PackageActionState,
  formData: FormData,
): Promise<PackageActionState> {
  const clientPackageId = String(formData.get("clientPackageId") ?? "");
  const serviceId = String(formData.get("serviceId") ?? "");
  if (!clientPackageId || !serviceId) {
    return { status: "error", message: "Dados incompletos." };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const result = await withUser(ctx.userId, async (tx) => {
      const remaining = await remainingForService(
        tx,
        ctx.tenant.id,
        clientPackageId,
        serviceId,
      );
      if (remaining <= 0) return { error: "Sem saldo para este serviço no pacote." };

      const [service] = await tx
        .select({ name: services.name, priceCents: services.priceCents })
        .from(services)
        .where(and(eq(services.id, serviceId), eq(services.tenantId, ctx.tenant.id)))
        .limit(1);
      if (!service) return { error: "Serviço não encontrado." };

      const liability = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "liability_package",
      );
      const revenue = await getSystemAccountId(
        tx,
        ctx.tenant.id,
        "revenue_service",
      );
      if (!liability || !revenue) {
        return { error: "Crie o plano de contas padrão em Financeiro." };
      }

      const amountCents = service.priceCents;

      const entryId = await postEntry(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        description: `Resgate de pacote: ${service.name}`,
        idempotencyKey: `package-redeem-${randomUUID()}`,
        referenceType: "client_package",
        referenceId: clientPackageId,
        lines: [
          { accountId: liability, direction: "debit", amountCents },
          { accountId: revenue, direction: "credit", amountCents },
        ],
      });

      await tx.insert(packageRedemptions).values({
        tenantId: ctx.tenant.id,
        clientPackageId,
        serviceId,
        amountCents,
        entryId,
        createdBy: ctx.userId,
      });

      return { ok: true as const };
    });

    if ("error" in result) return { status: "error", message: result.error };
    revalidatePath("/packages");
    revalidatePath("/finance");
    return { status: "success", message: "Resgate registrado." };
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }
}
