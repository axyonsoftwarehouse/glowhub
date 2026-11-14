"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };
type Group = { title: string; items: Item[] };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  hasProfessional,
  canManageTenant,
  isSolo,
}: {
  hasProfessional: boolean;
  canManageTenant: boolean;
  isSolo: boolean;
}) {
  const pathname = usePathname();

  const fullGroups: Group[] = [
    {
      title: "Operação",
      items: [
        { href: "/dashboard", label: "Visão geral" },
        { href: "/appointments", label: "Agenda" },
        ...(hasProfessional ? [{ href: "/my-schedule", label: "Minha agenda" }] : []),
        { href: "/clients", label: "Clientes" },
        { href: "/schedule", label: "Horários" },
        { href: "/assistant", label: "Assistente IA" },
      ],
    },
    {
      title: "Catálogo",
      items: [
        { href: "/services", label: "Serviços" },
        { href: "/products", label: "Produtos" },
        { href: "/inventory", label: "Estoque" },
        { href: "/packages", label: "Pacotes" },
        { href: "/subscriptions", label: "Assinaturas" },
      ],
    },
    {
      title: "Marketing",
      items: [
        { href: "/coupons", label: "Cupons" },
        { href: "/loyalty", label: "Fidelidade" },
        { href: "/notifications", label: "Mensagens" },
      ],
    },
    {
      title: "Financeiro",
      items: [
        { href: "/finance", label: "Financeiro" },
        { href: "/reconciliation", label: "Conciliação" },
        { href: "/reports", label: "Relatórios" },
        ...(canManageTenant ? [{ href: "/closing", label: "Fechamento" }] : []),
      ],
    },
    {
      title: "Empresa",
      items: [
        { href: "/branches", label: "Filiais" },
        { href: "/professionals", label: "Profissionais" },
        { href: "/team", label: "Equipe" },
        ...(canManageTenant
          ? [
              { href: "/settings", label: "Configurações" },
              { href: "/billing", label: "Plano e cobrança" },
            ]
          : []),
        { href: "/profile", label: "Perfil" },
      ],
    },
  ];

  const leanGroups: Group[] = [
    {
      title: "Operação",
      items: [
        { href: "/dashboard", label: "Visão geral" },
        { href: "/appointments", label: "Agenda" },
        ...(hasProfessional
          ? [{ href: "/my-schedule", label: "Minha agenda" }]
          : []),
        { href: "/clients", label: "Clientes" },
        { href: "/schedule", label: "Horários" },
        { href: "/assistant", label: "Assistente IA" },
      ],
    },
    {
      title: "Catálogo",
      items: [{ href: "/services", label: "Serviços" }],
    },
    {
      title: "Financeiro",
      items: [{ href: "/finance", label: "Caixa" }],
    },
    {
      title: "Minha empresa",
      items: [
        { href: "/helpers", label: "Ajudante" },
        { href: "/notifications", label: "Mensagens" },
        ...(canManageTenant
          ? [
              { href: "/settings", label: "Configurações" },
              { href: "/billing", label: "Plano e cobrança" },
            ]
          : []),
        { href: "/profile", label: "Perfil" },
      ],
    },
  ];

  const groups = isSolo ? leanGroups : fullGroups;

  return (
    <nav aria-label="Navegação principal" className="mt-6 flex flex-col gap-4 text-sm">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-foreground/70">
            {group.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "block rounded-lg bg-muted px-3 py-1.5 font-medium text-brand"
                        : "block rounded-lg px-3 py-1.5 hover:bg-muted"
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
