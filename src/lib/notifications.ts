import { notifications } from "@/db/schema";
import type { AppTx } from "@/lib/db";

export async function enqueueEmail(
  tx: AppTx,
  params: {
    tenantId: string;
    recipient: string;
    subject: string;
    body: string;
    createdBy?: string | null;
  },
): Promise<void> {
  await tx.insert(notifications).values({
    tenantId: params.tenantId,
    channel: "email",
    recipient: params.recipient,
    subject: params.subject,
    body: params.body,
    status: "pending",
    createdBy: params.createdBy ?? null,
  });
}
