"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { profiles } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { ProfileActionState } from "./types";

const profileInput = z.object({
  fullName: z.string().trim().max(120, "No máximo 120 caracteres."),
  avatarUrl: z
    .string()
    .trim()
    .max(500, "No máximo 500 caracteres.")
    .refine(
      (value) => value === "" || /^https?:\/\/\S+$/i.test(value),
      "Informe uma URL http(s) válida.",
    ),
  timezone: z.string().trim().min(1, "Selecione o fuso horário.").max(64),
});

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export async function updateProfileAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = profileInput.safeParse({
    fullName: formData.get("fullName") ?? "",
    avatarUrl: formData.get("avatarUrl") ?? "",
    timezone: formData.get("timezone") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const session = await getSession();
  if (!session?.user) return { status: "error", message: "Sessão expirada." };
  const userId = session.user.id;

  const fullName =
    parsed.data.fullName.length > 0 ? parsed.data.fullName : null;
  const avatarUrl =
    parsed.data.avatarUrl.length > 0 ? parsed.data.avatarUrl : null;
  const emailNotifications = formData.get("emailNotifications") === "on";

  try {
    await withUser(userId, async (tx) => {
      await tx
        .insert(profiles)
        .values({
          id: userId,
          fullName,
          avatarUrl,
          timezone: parsed.data.timezone,
          emailNotifications,
        })
        .onConflictDoUpdate({
          target: profiles.id,
          set: { fullName, avatarUrl, timezone: parsed.data.timezone, emailNotifications },
        });
    });
  } catch (cause) {
    return { status: "error", message: String(cause) };
  }

  revalidatePath("/profile");
  return { status: "success", message: "Perfil atualizado." };
}
