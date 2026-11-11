import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getPendingDocuments } from "@/lib/legal";
import { AuthCard, primaryButtonClass } from "../auth-card";
import { SignOutButton } from "@/app/(app)/sign-out-button";
import { acceptLegalAction } from "./actions";

export const metadata = { title: "Termos atualizados · GlowHub" };

export default async function AcceptTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const pending = await getPendingDocuments(session.user.id);
  if (pending.length === 0) redirect("/dashboard");
  const { erro } = await searchParams;

  return (
    <AuthCard
      title="Aceite dos termos"
      subtitle="Para continuar usando o GlowHub, leia e aceite os documentos abaixo."
    >
      <form
        action={acceptLegalAction}
        className="rounded-2xl border border-border bg-white/70 p-6 text-sm"
      >
        <ul className="space-y-2">
          {pending.includes("terms") && (
            <li>
              <Link href="/termos" target="_blank" className="text-brand underline">
                Termos de Uso
              </Link>
            </li>
          )}
          {pending.includes("privacy") && (
            <li>
              <Link href="/privacidade" target="_blank" className="text-brand underline">
                Política de Privacidade
              </Link>
            </li>
          )}
        </ul>
        <label className="mt-5 flex items-start gap-2 text-foreground/80">
          <input
            type="checkbox"
            name="accept"
            required
            className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
          />
          <span>Li e aceito os documentos acima.</span>
        </label>
        {erro && (
          <p role="alert" className="mt-3 text-red-600">
            Marque a caixa de aceite para continuar.
          </p>
        )}
        <button type="submit" className={primaryButtonClass}>
          Aceitar e continuar
        </button>
      </form>
      <div className="mt-6 flex justify-center">
        <SignOutButton />
      </div>
    </AuthCard>
  );
}
