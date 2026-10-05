import { and, desc, eq } from "drizzle-orm";
import { memberships, notifications } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { ProcessNotificationsButton } from "./process-button";
import type { Notification } from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager", "staff"];

const STATUS_STYLES: Record<Notification["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<Notification["status"], string> = {
  pending: "Pendente",
  sent: "Enviada",
  failed: "Falhou",
};

function formatDate(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

export default async function NotificationsPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para ver as mensagens.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: notifications.id,
        channel: notifications.channel,
        recipient: notifications.recipient,
        subject: notifications.subject,
        status: notifications.status,
        error: notifications.error,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.tenantId, tenant.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    const [membership] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenant.id),
          eq(memberships.userId, userId),
        ),
      )
      .limit(1);

    return {
      rows,
      canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
    };
  });

  const list: Notification[] = data.rows.map((row) => ({
    id: row.id,
    channel: row.channel,
    recipient: row.recipient,
    subject: row.subject,
    status: row.status,
    error: row.error ?? null,
    createdAt: row.createdAt.toISOString(),
  }));

  const pendingCount = list.filter((n) => n.status === "pending").length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-brand">
            Comunicação
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Mensagens</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Caixa de saída de {tenant.name}. {pendingCount} pendente(s).
          </p>
        </div>
        {data.canManage && (
          <ProcessNotificationsButton disabled={pendingCount === 0} />
        )}
      </header>

      <section className="space-y-2">
        {list.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-border bg-white/70 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.subject}</p>
                <p className="truncate text-xs text-foreground/70">
                  {item.channel} · {item.recipient} · {formatDate(item.createdAt)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLES[item.status]}`}
              >
                {STATUS_LABELS[item.status]}
              </span>
            </div>
            {item.error && (
              <p className="mt-1 text-xs text-red-600">{item.error}</p>
            )}
          </div>
        ))}
        {list.length === 0 && (
          <p className="text-sm text-foreground/60">
            Nenhuma mensagem ainda. Confirmações de agendamento online caem aqui.
          </p>
        )}
      </section>
    </div>
  );
}
