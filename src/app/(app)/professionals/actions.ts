"use server";

import { isUuid } from "@/lib/validation";

import { internalError } from "@/lib/errors";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import {
  branches,
  memberships,
  professionalBranches,
  professionalServices,
  professionals,
  services,
} from "@/db/schema";
import { withUser, type AppTx } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { ProfessionalActionState } from "./types";

const nameInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe ao menos 2 caracteres.")
    .max(120, "No máximo 120 caracteres."),
  commission: z.string().trim().optional(),
});

function parseCommissionBp(raw: string | undefined): number | null {
  const cleaned = (raw ?? "").replace("%", "").replace(",", ".").trim();
  if (cleaned === "") return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100);
}

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

export async function createProfessionalAction(
  _prev: ProfessionalActionState,
  formData: FormData,
): Promise<ProfessionalActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = nameInput.safeParse({
    name: formData.get("name") ?? "",
    commission: formData.get("commission") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const commissionBp = parseCommissionBp(parsed.data.commission);
  if (commissionBp === null) {
    return { status: "error", fieldErrors: { commission: ["Comissão deve ser entre 0 e 100%."] } };
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      await tx.insert(professionals).values({
        tenantId: ctx.tenant.id,
        name: parsed.data.name,
        commissionBp,
      });
    });
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", fieldErrors: { name: ["Já existe um profissional com esse nome."] } };
    }
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite criar profissionais." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/professionals");
  return { status: "success", message: "Profissional criado." };
}

export async function updateProfessionalAction(
  _prev: ProfessionalActionState,
  formData: FormData,
): Promise<ProfessionalActionState> {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { status: "error", message: "Profissional inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = nameInput.safeParse({
    name: formData.get("name") ?? "",
    commission: formData.get("commission") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const commissionBp = parseCommissionBp(parsed.data.commission);
  if (commissionBp === null) {
    return { status: "error", fieldErrors: { commission: ["Comissão deve ser entre 0 e 100%."] } };
  }

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(professionals)
        .set({ name: parsed.data.name, commissionBp })
        .where(
          and(
            eq(professionals.id, id),
            eq(professionals.tenantId, ctx.tenant.id),
          ),
        )
        .returning({ id: professionals.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para editar este profissional." };
    }
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", fieldErrors: { name: ["Já existe um profissional com esse nome."] } };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/professionals");
  return { status: "success", message: "Profissional atualizado." };
}

export async function setProfessionalActiveAction(
  _prev: ProfessionalActionState,
  formData: FormData,
): Promise<ProfessionalActionState> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!isUuid(id)) return { status: "error", message: "Profissional inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(professionals)
        .set({ isActive })
        .where(
          and(
            eq(professionals.id, id),
            eq(professionals.tenantId, ctx.tenant.id),
          ),
        )
        .returning({ id: professionals.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para alterar este profissional." };
    }
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/professionals");
  return { status: "success" };
}

export async function linkProfessionalUserAction(
  _prev: ProfessionalActionState,
  formData: FormData,
): Promise<ProfessionalActionState> {
  const professionalId = String(formData.get("professionalId") ?? "");
  const rawUserId = String(formData.get("userId") ?? "");
  const userId = rawUserId === "" ? null : rawUserId;
  if (!isUuid(professionalId)) {
    return { status: "error", message: "Profissional inválido." };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) => {
      if (userId) {
        const [member] = await tx
          .select({ userId: memberships.userId })
          .from(memberships)
          .where(
            and(
              eq(memberships.tenantId, ctx.tenant.id),
              eq(memberships.userId, userId),
            ),
          )
          .limit(1);
        if (!member) throw new Error("Usuário não é membro desta empresa.");

        const [linked] = await tx
          .select({ id: professionals.id })
          .from(professionals)
          .where(
            and(
              eq(professionals.tenantId, ctx.tenant.id),
              eq(professionals.userId, userId),
            ),
          )
          .limit(1);
        if (linked && linked.id !== professionalId) {
          throw new Error("Esse usuário já está vinculado a outro profissional.");
        }
      }

      return tx
        .update(professionals)
        .set({ userId })
        .where(
          and(
            eq(professionals.id, professionalId),
            eq(professionals.tenantId, ctx.tenant.id),
          ),
        )
        .returning({ id: professionals.id });
    });

    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para editar este profissional." };
    }
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/professionals");
  return { status: "success", message: "Vínculo de acesso atualizado." };
}

async function validIds(
  tx: AppTx,
  table: typeof branches | typeof services,
  tenantId: string,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.tenantId, tenantId), inArray(table.id, ids)));
  return rows.map((row) => row.id);
}

export async function updateProfessionalLinksAction(
  _prev: ProfessionalActionState,
  formData: FormData,
): Promise<ProfessionalActionState> {
  const professionalId = String(formData.get("professionalId") ?? "");
  if (!isUuid(professionalId)) {
    return { status: "error", message: "Profissional inválido." };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const requestedBranches = formData.getAll("branchIds").map(String);
  const requestedServices = formData.getAll("serviceIds").map(String);

  try {
    await withUser(ctx.userId, async (tx) => {
      const [professional] = await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          and(
            eq(professionals.id, professionalId),
            eq(professionals.tenantId, ctx.tenant.id),
          ),
        )
        .limit(1);
      if (!professional) throw new Error("Profissional não encontrado.");

      const branchIds = await validIds(
        tx,
        branches,
        ctx.tenant.id,
        requestedBranches,
      );
      const serviceIds = await validIds(
        tx,
        services,
        ctx.tenant.id,
        requestedServices,
      );

      if (branchIds.length > 0) {
        await tx
          .insert(professionalBranches)
          .values(
            branchIds.map((branchId) => ({
              tenantId: ctx.tenant.id,
              professionalId,
              branchId,
            })),
          )
          .onConflictDoNothing();
      }
      await tx
        .delete(professionalBranches)
        .where(
          branchIds.length > 0
            ? and(
                eq(professionalBranches.tenantId, ctx.tenant.id),
                eq(professionalBranches.professionalId, professionalId),
                notInArray(professionalBranches.branchId, branchIds),
              )
            : and(
                eq(professionalBranches.tenantId, ctx.tenant.id),
                eq(professionalBranches.professionalId, professionalId),
              ),
        );

      if (serviceIds.length > 0) {
        await tx
          .insert(professionalServices)
          .values(
            serviceIds.map((serviceId) => ({
              tenantId: ctx.tenant.id,
              professionalId,
              serviceId,
            })),
          )
          .onConflictDoNothing();
      }
      await tx
        .delete(professionalServices)
        .where(
          serviceIds.length > 0
            ? and(
                eq(professionalServices.tenantId, ctx.tenant.id),
                eq(professionalServices.professionalId, professionalId),
                notInArray(professionalServices.serviceId, serviceIds),
              )
            : and(
                eq(professionalServices.tenantId, ctx.tenant.id),
                eq(professionalServices.professionalId, professionalId),
              ),
        );
    });
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/professionals");
  return { status: "success", message: "Vínculos atualizados." };
}
