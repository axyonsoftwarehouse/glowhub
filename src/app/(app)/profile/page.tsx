import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { profiles } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { ProfileForm } from "./profile-form";
import type { Profile } from "./types";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const profileRow = await withUser(userId, async (tx) => {
    const [row] = await tx
      .select({
        fullName: profiles.fullName,
        avatarUrl: profiles.avatarUrl,
        timezone: profiles.timezone,
        emailNotifications: profiles.emailNotifications,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return row ?? null;
  });

  const profile: Profile = {
    fullName: profileRow?.fullName ?? null,
    avatarUrl: profileRow?.avatarUrl ?? null,
    timezone: profileRow?.timezone ?? "America/Sao_Paulo",
    emailNotifications: profileRow ? profileRow.emailNotifications : true,
  };

  const tenant = await getCurrentTenant();

  return (
    <div className="max-w-xl space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Conta</p>
        <h1 className="mt-2 text-2xl font-semibold">Perfil</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {session.user.email}
          {tenant ? ` · ${tenant.name}` : ""}
        </p>
      </header>

      <ProfileForm profile={profile} />
    </div>
  );
}
