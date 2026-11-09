import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
} from "drizzle-orm";
import {
  appointments,
  branches,
  clients,
  notifications,
  tenants,
} from "@/db/schema";
import { getDb, type AppTx } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  formatReminderWhen,
  reminderDedupeKey,
  reminderScheduledFor,
} from "@/lib/reminders";

type Db = ReturnType<typeof getDb>;

export async function enqueueEmail(
  tx: AppTx,
  params: {
    tenantId: string;
    recipient: string;
    subject: string;
    body: string;
    createdBy?: string | null;
    scheduledFor?: Date | null;
    dedupeKey?: string | null;
  },
): Promise<void> {
  await tx
    .insert(notifications)
    .values({
      tenantId: params.tenantId,
      channel: "email",
      recipient: params.recipient,
      subject: params.subject,
      body: params.body,
      status: "pending",
      scheduledFor: params.scheduledFor ?? null,
      dedupeKey: params.dedupeKey ?? null,
      createdBy: params.createdBy ?? null,
    })
    .onConflictDoNothing();
}

/**
 * Enfileira lembrete 24h antes dos atendimentos futuros (janela padrão de 36h).
 * A chave `appointment-reminder-<id>` evita duplicar entre execuções do cron.
 */
export async function enqueueUpcomingReminders(
  db: Db,
  params: { now?: Date; windowHours?: number } = {},
): Promise<{ enqueued: number }> {
  const now = params.now ?? new Date();
  const windowHours = Math.max(1, params.windowHours ?? 36);
  const until = new Date(now.getTime() + windowHours * 3_600_000);

  const rows = await db
    .select({
      id: appointments.id,
      tenantId: appointments.tenantId,
      tenantName: tenants.name,
      clientName: clients.name,
      email: clients.email,
      startsAt: appointments.startsAt,
      timezone: branches.timezone,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(tenants, eq(tenants.id, appointments.tenantId))
    .innerJoin(branches, eq(branches.id, appointments.branchId))
    .where(
      and(
        eq(tenants.isActive, true),
        inArray(appointments.status, ["pending", "confirmed"]),
        gte(appointments.startsAt, now),
        lte(appointments.startsAt, until),
        isNotNull(clients.email),
        ne(clients.email, ""),
      ),
    );

  let enqueued = 0;
  for (const row of rows) {
    if (!row.email) continue;
    const inserted = await db
      .insert(notifications)
      .values({
        tenantId: row.tenantId,
        channel: "email",
        recipient: row.email,
        subject: `Lembrete do seu horário em ${row.tenantName}`,
        body: `Olá ${row.clientName}, seu horário está marcado para ${formatReminderWhen(
          row.startsAt,
          row.timezone,
        )}. Se precisar remarcar, entre em contato com ${row.tenantName}.`,
        status: "pending",
        scheduledFor: reminderScheduledFor(row.startsAt, now),
        dedupeKey: reminderDedupeKey(row.id),
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    if (inserted.length > 0) enqueued += 1;
  }

  return { enqueued };
}

/**
 * Envia notificações de e-mail vencidas (sem agendamento ou com
 * `scheduled_for <= agora`). Usado pelo cron diário, com a conexão admin.
 */
export async function processDueNotifications(
  db: Db,
  params: { now?: Date; limit?: number } = {},
): Promise<{ sent: number; failed: number }> {
  const now = params.now ?? new Date();
  const limit = Math.min(params.limit ?? 100, 200);

  const rows = await db
    .select({
      id: notifications.id,
      recipient: notifications.recipient,
      subject: notifications.subject,
      body: notifications.body,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.status, "pending"),
        eq(notifications.channel, "email"),
        or(
          isNull(notifications.scheduledFor),
          lte(notifications.scheduledFor, now),
        ),
      ),
    )
    .orderBy(asc(notifications.createdAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const item of rows) {
    const result = await sendEmail({
      to: item.recipient,
      subject: item.subject,
      html: item.body,
    });

    await db
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
      .where(eq(notifications.id, item.id));

    if (result.ok) sent += 1;
    else failed += 1;
  }

  return { sent, failed };
}
