import { asc, desc, eq, inArray } from "drizzle-orm";
import { invitations, memberships, profiles } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { InviteForm } from "./invite-form";
import { InvitationRow } from "./invitation-row";
import { ROLE_LABELS, type Invitation, type Member } from "./types";

export const dynamic = "force-dynamic";

const VIEW_ROLES = ["owner", "admin", "manager"];
const MANAGE_ROLES = ["owner", "admin"];

export default async function TeamPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar a equipe.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const result = await withUser(userId, async (tx) => {
    const memberRows = await tx
      .select({
        userId: memberships.userId,
        role: memberships.role,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .where(eq(memberships.tenantId, tenant.id))
      .orderBy(asc(memberships.createdAt));

    const currentRole =
      memberRows.find((row) => row.userId === userId)?.role ?? "";
    const canView = VIEW_ROLES.includes(currentRole);
    if (!canView) return { canView: false as const, members: [], currentRole };

    const userIds = memberRows.map((row) => row.userId);
    const profileRows = userIds.length
      ? await tx
          .select({
            id: profiles.id,
            fullName: profiles.fullName,
            avatarUrl: profiles.avatarUrl,
          })
          .from(profiles)
          .where(inArray(profiles.id, userIds))
      : [];

    const profileMap = new Map(profileRows.map((row) => [row.id, row]));
    const members: Member[] = memberRows.map((row) => ({
      userId: row.userId,
      role: row.role,
      fullName: profileMap.get(row.userId)?.fullName ?? null,
      avatarUrl: profileMap.get(row.userId)?.avatarUrl ?? null,
      createdAt: row.createdAt.toISOString(),
    }));

    const canManage = MANAGE_ROLES.includes(currentRole);
    let invitationList: Invitation[] = [];
    if (canManage) {
      const rows = await tx
        .select({
          id: invitations.id,
          email: invitations.email,
          role: invitations.role,
          token: invitations.token,
          expiresAt: invitations.expiresAt,
        })
        .from(invitations)
        .where(eq(invitations.tenantId, tenant.id))
        .orderBy(desc(invitations.createdAt));

      invitationList = rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        token: row.token,
        expiresAt: row.expiresAt.toISOString(),
      }));
    }

    return {
      canView: true as const,
      members,
      currentRole,
      canManage,
      invitations: invitationList,
    };
  });

  if (!result.canView) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Sem permissão</h1>
        <p className="mt-2 text-foreground/70">
          Apenas proprietários, administradores e gerentes podem ver a equipe.
        </p>
      </div>
    );
  }

  const canManage = "canManage" in result ? result.canManage : false;
  const invitationList =
    "invitations" in result ? (result.invitations ?? []) : [];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">
          Organização
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Equipe</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Pessoas com acesso a {tenant.name}.
        </p>
      </header>

      {canManage && <InviteForm />}

      {canManage && invitationList.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Convites pendentes
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {invitationList.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Membros
          </h2>
          <span className="text-xs text-foreground/50">
            {result.members.length} pessoa(s)
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.members.map((member) => (
            <article
              key={member.userId}
              className="rounded-xl border border-border bg-white/70 p-4"
            >
              <p className="truncate text-sm font-medium">
                {member.fullName || "Sem nome"}
              </p>
              <p className="mt-0.5 text-xs text-foreground/50">
                {ROLE_LABELS[member.role] ?? member.role}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
