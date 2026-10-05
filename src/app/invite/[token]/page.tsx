import Link from "next/link";
import { isConfigured } from "@/lib/env";
import { getSession } from "@/lib/session";
import { SetupNotice } from "@/components/setup-notice";
import { AcceptInviteButton } from "./accept-invite-button";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!isConfigured()) {
    return (
      <main id="conteudo" className="mx-auto w-full max-w-md flex-1 px-6 py-16">
        <SetupNotice />
      </main>
    );
  }

  const session = await getSession();
  const user = session?.user ?? null;

  return (
    <main
      id="conteudo"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16"
    >
      <div className="mb-8 text-center">
        <span className="text-lg font-semibold tracking-tight">
          Glow<span className="text-brand">Hub</span>
        </span>
        <h1 className="mt-4 text-2xl font-semibold">Convite de equipe</h1>
        <p className="mt-2 text-sm text-foreground/60">
          {user
            ? `Você está conectado como ${user.email}.`
            : "Entre ou crie sua conta para aceitar o convite."}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white/70 p-6">
        {user ? (
          <AcceptInviteButton token={token} />
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
            className="block w-full rounded-full bg-brand px-4 py-2.5 text-center font-medium text-brand-foreground"
          >
            Entrar para aceitar
          </Link>
        )}
      </div>
    </main>
  );
}
