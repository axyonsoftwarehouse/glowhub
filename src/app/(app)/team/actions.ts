"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { invitations } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { TeamActionState } from "./types";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const inviteInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Informe um e-mail.")
    .max(254, "E-mail muito longo.")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "E-mail inválido."),
  role: z.enum(["admin", "manager", "staff", "viewer"]),
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

export async function inviteMemberAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = inviteInput.safeParse({
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  try {
    await withUser(ctx.userId, async (tx) => {
      await tx
        .insert(invitations)
        .values({
          tenantId: ctx.tenant.id,
          email: parsed.data.email,
          role: parsed.data.role,
          token,
          expiresAt,
          invitedBy: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [invitations.tenantId, invitations.email],
          set: {
            role: parsed.data.role,
            token,
            expiresAt,
            invitedBy: ctx.userId,
          },
        });
    });
  } catch (cause) {
    if (errorCode(cause) === "42501") {
      return { status: "error", message: "Seu papel não permite convidar." };
    }
    return { status: "error", message: String(cause) };
  }

  revalidatePath("/team");
  return {
    status: "success",
    message: "Convite gerado. Copie o link e envie para a pessoa.",
  };
}

export async function revokeInvitationAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Convite inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const removed = await withUser(ctx.userId, async (tx) =>
      tx
        .delete(invitations)
        .where(
          and(
            eq(invitations.id, id),
            eq(invitations.tenantId, ctx.tenant.id),
          ),
        )
        .returning({ id: invitations.id }),
    );
    if (removed.length === 0) return { status: "error", message: "Convite não encontrado." };
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }

  revalidatePath("/team");
  return { status: "success", message: "Convite revogado." };
}
