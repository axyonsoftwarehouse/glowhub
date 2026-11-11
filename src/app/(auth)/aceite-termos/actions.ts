"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getPendingDocuments, recordAcceptance } from "@/lib/legal";

export async function acceptLegalAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (formData.get("accept") !== "on") redirect("/aceite-termos?erro=1");

  const pending = await getPendingDocuments(session.user.id);
  await recordAcceptance(session.user.id, await headers(), pending);
  redirect("/dashboard");
}
