import Link from "next/link";
import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/env";
import { getCurrentTenant, getMyProfessional, getUserTenants } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { SetupNotice } from "@/components/setup-notice";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { SignOutButton } from "./sign-out-button";
import { TenantSwitcher } from "./tenant-switcher";
import { VerifyEmailBanner } from "./verify-email-banner";
import { isAuthEmailSuppressed } from "@/lib/auth-emails";
import { getPendingDocuments } from "@/lib/legal";
import { getAccess } from "@/lib/billing/service";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isConfigured()) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <SetupNotice />
      </div>
    );
  }

  const session = await getSession();
  if (!session?.user) redirect("/login");
  const user = session.user;

  // Termos/Politica: quem ainda nao aceitou a versao vigente aceita antes de usar
  // o painel (conta demo dispensada).
  if (!isAuthEmailSuppressed(user.email)) {
    const pendingLegal = await getPendingDocuments(user.id);
    if (pendingLegal.length > 0) redirect("/aceite-termos");
  }

  const [tenant, tenants, myProfessional] = await Promise.all([
    getCurrentTenant(),
    getUserTenants(),
    getMyProfessional(),
  ]);

  const activeRole = tenants.find((t) => t.id === tenant?.id)?.role ?? "";
  const canManageTenant = activeRole === "owner" || activeRole === "admin";

  // Assinatura do GlowHub: teste vencido ou atraso alem da tolerancia bloqueia o
  // painel da empresa (a pagina /billing fica fora deste layout).
  const billing = tenant && activeRole ? (await getAccess(tenant)).access : null;
  if (billing?.level === "blocked") redirect("/billing");

  return (
    <div className="flex min-h-screen w-full">
      <aside className="hidden w-64 flex-col border-r border-border bg-white/60 p-5 sm:flex">
        <Link href="/dashboard" className="text-base font-semibold tracking-tight">
          Glow<span className="text-brand">Hub</span>
        </Link>

        {tenants.length > 0 ? (
          <TenantSwitcher
            tenants={tenants}
            activeTenantId={tenant?.id ?? null}
          />
        ) : (
          <div className="mt-6 rounded-xl bg-muted p-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-foreground/70">
              Empresa
            </p>
            <p className="mt-1 font-medium">
              {tenant ? tenant.name : "Nenhum tenant"}
            </p>
            {tenant && (
              <p className="text-xs text-foreground/70">/{tenant.slug}</p>
            )}
          </div>
        )}

        <SidebarNav
          hasProfessional={Boolean(myProfessional)}
          canManageTenant={canManageTenant}
          isSolo={Boolean(tenant?.isSolo)}
        />

        <div className="mt-auto space-y-3">
          <p className="truncate text-xs text-foreground/70">{user.email}</p>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-4 sm:hidden">
          <Link href="/dashboard" className="font-semibold">
            Glow<span className="text-brand">Hub</span>
          </Link>
          <SignOutButton />
        </header>
        <main id="conteudo" className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 sm:py-8">
          {billing?.level === "warning" && (
            <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="flex-1">{billing.message}</p>
              <Link
                href="/billing"
                className="rounded-full border border-amber-400 bg-white px-3 py-1 font-medium hover:bg-amber-100"
              >
                {canManageTenant ? "Ver planos" : "Detalhes"}
              </Link>
            </div>
          )}
          {!user.emailVerified && !isAuthEmailSuppressed(user.email) && (
            <VerifyEmailBanner email={user.email} />
          )}
          {tenant?.isReadOnly && (
            <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Modo demonstração: este ambiente é somente leitura para catálogo,
              financeiro, equipe e configurações. Agenda e agendamento online
              seguem liberados.
            </div>
          )}
          {children}
        </main>
      </div>

      <MobileNav
        isSolo={Boolean(tenant?.isSolo)}
        canManageTenant={canManageTenant}
        hasProfessional={Boolean(myProfessional)}
      />
    </div>
  );
}
