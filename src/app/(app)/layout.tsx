import Link from "next/link";
import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/env";
import { getCurrentTenant, getMyProfessional, getUserTenants } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { SetupNotice } from "@/components/setup-notice";
import { SignOutButton } from "./sign-out-button";
import { TenantSwitcher } from "./tenant-switcher";

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

  const [tenant, tenants, myProfessional] = await Promise.all([
    getCurrentTenant(),
    getUserTenants(),
    getMyProfessional(),
  ]);

  const activeRole = tenants.find((t) => t.id === tenant?.id)?.role ?? "";
  const canManageTenant = activeRole === "owner" || activeRole === "admin";

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

        <nav
          aria-label="Navegação principal"
          className="mt-6 flex flex-col gap-1 text-sm"
        >
          <Link href="/dashboard" className="rounded-lg px-3 py-2 hover:bg-muted">
            Visão geral
          </Link>
          <Link href="/branches" className="rounded-lg px-3 py-2 hover:bg-muted">
            Filiais
          </Link>
          <Link href="/services" className="rounded-lg px-3 py-2 hover:bg-muted">
            Serviços
          </Link>
          <Link href="/products" className="rounded-lg px-3 py-2 hover:bg-muted">
            Produtos
          </Link>
          <Link
            href="/professionals"
            className="rounded-lg px-3 py-2 hover:bg-muted"
          >
            Profissionais
          </Link>
          <Link href="/schedule" className="rounded-lg px-3 py-2 hover:bg-muted">
            Horários
          </Link>
          <Link href="/appointments" className="rounded-lg px-3 py-2 hover:bg-muted">
            Agenda
          </Link>
          {myProfessional && (
            <Link
              href="/my-schedule"
              className="rounded-lg px-3 py-2 hover:bg-muted"
            >
              Minha agenda
            </Link>
          )}
          <Link href="/clients" className="rounded-lg px-3 py-2 hover:bg-muted">
            Clientes
          </Link>
          <Link href="/packages" className="rounded-lg px-3 py-2 hover:bg-muted">
            Pacotes
          </Link>
          <Link href="/subscriptions" className="rounded-lg px-3 py-2 hover:bg-muted">
            Assinaturas
          </Link>
          <Link href="/coupons" className="rounded-lg px-3 py-2 hover:bg-muted">
            Cupons
          </Link>
          <Link href="/notifications" className="rounded-lg px-3 py-2 hover:bg-muted">
            Mensagens
          </Link>
          <Link href="/team" className="rounded-lg px-3 py-2 hover:bg-muted">
            Equipe
          </Link>
          <Link href="/finance" className="rounded-lg px-3 py-2 hover:bg-muted">
            Financeiro
          </Link>
          <Link
            href="/reconciliation"
            className="rounded-lg px-3 py-2 hover:bg-muted"
          >
            Conciliação
          </Link>
          <Link href="/reports" className="rounded-lg px-3 py-2 hover:bg-muted">
            Relatórios
          </Link>
          {canManageTenant && (
            <Link
              href="/closing"
              className="rounded-lg px-3 py-2 hover:bg-muted"
            >
              Fechamento
            </Link>
          )}
          {canManageTenant && (
            <Link
              href="/settings"
              className="rounded-lg px-3 py-2 hover:bg-muted"
            >
              Configurações
            </Link>
          )}
          <Link href="/profile" className="rounded-lg px-3 py-2 hover:bg-muted">
            Perfil
          </Link>
        </nav>

        <div className="mt-auto space-y-3">
          <p className="truncate text-xs text-foreground/70">{user.email}</p>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-4 sm:hidden">
          <Link href="/dashboard" className="font-semibold">
            Glow<span className="text-brand">Hub</span>
          </Link>
          <SignOutButton />
        </header>
        <main id="conteudo" className="flex-1 px-6 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
