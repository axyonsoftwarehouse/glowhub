"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { branches, memberships, profiles, tenants } from "@/db/schema";
import { getDb } from "@/lib/db";
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
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const baseSlug = parsed.data.slug || slugify(parsed.data.name) || "empresa";

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
        .values({ slug, name: parsed.data.name })
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

      await tx
        .insert(profiles)
        .values({ id: userId, activeTenantId: tenant.id })
        .onConflictDoUpdate({
          target: profiles.id,
          set: { activeTenantId: tenant.id },
        });
    });
  } catch (cause) {
    const message = String(cause);
    if (message.includes("tenants_slug_key")) {
      return { status: "error", fieldErrors: { slug: ["Este identificador já está em uso."] } };
    }
    return { status: "error", message: "Não foi possível criar a empresa." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
