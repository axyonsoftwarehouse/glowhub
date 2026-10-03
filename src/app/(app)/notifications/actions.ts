"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { notifications } from "@/db/schema";
import { withUser } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { NotificationActionState } from "./types";

export async function processNotificationsAction(): Promise<NotificationActionState> {
  const tenant = await getCurrentTenant();
  if (!tenant) return { status: "error", message: "Empresa não resolvida." };
  const session = await getSession();
  if (!session?.user) return { status: "error", message: "Sessão expirada." };
  const userId = session.user.id;

  const pending = await withUser(userId, (tx) =>
    tx
      .select({
        id: notifications.id,
        recipient: notifications.recipient,
        subject: notifications.subject,
        body: notifications.body,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenant.id),
          eq(notifications.status, "pending"),
        ),
      )
      .orderBy(asc(notifications.createdAt))
      .limit(50),
  );

  let sent = 0;
  let failed = 0;
  for (const item of pending) {
    const result = await sendEmail({
      to: item.recipient,
      subject: item.subject,
      html: item.body,
    });
    await withUser(userId, (tx) =>
      tx
        .update(notifications)
        .set(
          result.ok
            ? {
                status: "sent",
                sentAt: new Date(),
                providerMessageId: result.id,
                error: null,
              }
            : { status: "failed", error: result.error },
        )
        .where(eq(notifications.id, item.id)),
    );
    if (result.ok) sent += 1;
    else failed += 1;
  }

  revalidatePath("/notifications");
  return {
    status: "success",
    message: `${sent} enviada(s), ${failed} falha(s).`,
  };
}
