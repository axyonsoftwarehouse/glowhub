"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  branchHours,
  branches,
  memberships,
  professionalBranches,
  professionals,
  professionalServices,
  profiles,
  services,
  tenants,
} from "@/db/schema";
import { ensureDefaultChart } from "@/lib/chart";
import { getDb, type AppTx } from "@/lib/db";
import { dbErrorMessage } from "@/lib/db-errors";
import { parsePriceToCents } from "@/lib/money";
import { getSession } from "@/lib/session";
import type { TenantActionState } from "./types";

const tenantInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe ao menos 2 caracteres.")
    .max(120, "No máximo 120 caracteres."),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use apenas letras minúsculas, números e hífens.",
    )
    .max(60)
    .optional()
    .or(z.literal("")),
  solo: z.boolean().default(false),
  serviceName: z.string().trim().max(120).optional().or(z.literal("")),
  serviceDuration: z.coerce
    .number()
    .int("Use minutos inteiros.")
    .min(5, "Mínimo 5 minutos.")
    .max(480, "Máximo 480 minutos.")
    .default(30),
  servicePrice: z.string().trim().max(30).optional().or(z.literal("")),
});

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/** Horário inicial do modo solo: seg–sex 9h–18h, sábado 9h–13h. */
const SOLO_HOURS = [
  ...Array.from({ length: 5 }, (_, index) => ({
    weekday: index + 1,
    startTime: "09:00",
    endTime: "18:00",
  })),
  { weekday: 6, startTime: "09:00", endTime: "13:00" },
];

export async function createTenantAction(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const parsed = tenantInput.safeParse({
    name: formData.get("name") ?? "",
    slug: formData.get("slug") ?? "",
    solo: formData.get("solo") === "on",
    serviceName: formData.get("serviceName") ?? "",
    serviceDuration: formData.get("serviceDuration") ?? 30,
    servicePrice: formData.get("servicePrice") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const rawPrice = parsed.data.servicePrice?.trim() ?? "";
  const servicePriceCents = rawPrice ? parsePriceToCents(rawPrice) : 0;
  if (servicePriceCents === null || servicePriceCents < 0) {
    return {
      status: "error",
      fieldErrors: { servicePrice: ["Preço inválido."] },
    };
  }

  const baseSlug = parsed.data.slug || slugify(parsed.data.name) || "empresa";
  const solo = parsed.data.solo;
  const professionalName = session.user.name?.trim() || "Meu nome";
  const serviceName = parsed.data.serviceName?.trim() || "Atendimento";

  try {
    // Onboarding: usuario autenticado sem tenant ainda. Usa a conexao admin
    // (o usuario nao e membro de nada, entao a RLS nao autorizaria o INSERT).
    await getDb().transaction(async (tx) => {
      let slug = baseSlug;
      const [existing] = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);
      if (existing) {
        slug = `${baseSlug}-${randomBytes(3).toString("hex")}`;
      }

      const [tenant] = await tx
        .insert(tenants)
        .values({ slug, name: parsed.data.name, isSolo: solo })
        .returning({ id: tenants.id });

      const [branch] = await tx
        .insert(branches)
        .values({
          tenantId: tenant.id,
          slug: "matriz",
          name: "Matriz",
        })
        .returning({ id: branches.id });

      await tx.insert(memberships).values({
        tenantId: tenant.id,
        userId,
        role: "owner",
        branchId: branch.id,
      });

      await ensureDefaultChart(tx as AppTx, tenant.id);

      if (solo) {
        const [professional] = await tx
          .insert(professionals)
          .values({
            tenantId: tenant.id,
            userId,
            name: professionalName,
          })
          .returning({ id: professionals.id });

        await tx.insert(professionalBranches).values({
          tenantId: tenant.id,
          professionalId: professional.id,
          branchId: branch.id,
        });

        const [service] = await tx
          .insert(services)
          .values({
            tenantId: tenant.id,
            name: serviceName,
            durationMinutes: parsed.data.serviceDuration,
            priceCents: servicePriceCents,
          })
          .returning({ id: services.id });

        await tx.insert(professionalServices).values({
          tenantId: tenant.id,
          professionalId: professional.id,
          serviceId: service.id,
        });

        await tx.insert(branchHours).values(
          SOLO_HOURS.map((hour) => ({
            tenantId: tenant.id,
            branchId: branch.id,
            weekday: hour.weekday,
            startTime: hour.startTime,
            endTime: hour.endTime,
          })),
        );
      }

      await tx
        .insert(profiles)
        .values({ id: userId, activeTenantId: tenant.id })
        .onConflictDoUpdate({
          target: profiles.id,
          set: { activeTenantId: tenant.id },
        });
    });
  } catch (cause) {
    const message = dbErrorMessage(cause);
    if (message.includes("tenants_slug_key")) {
      return { status: "error", fieldErrors: { slug: ["Este identificador já está em uso."] } };
    }
    return { status: "error", message: "Não foi possível criar a empresa." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
