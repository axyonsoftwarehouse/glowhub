"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = {
  href: string;
  label: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Hoje" },
  { href: "/appointments", label: "Agenda" },
  { href: "/clients", label: "Clientes" },
  { href: "/finance", label: "Caixa" },
];

function iconFor(label: string) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (label === "Hoje") {
    return (
      <svg {...common}>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10v9h13v-9" />
      </svg>
    );
  }
  if (label === "Agenda") {
    return (
      <svg {...common}>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M8 3.5v3M16 3.5v3M3.5 9.5h17" />
      </svg>
    );
  }
  if (label === "Clientes") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 20c.5-3.6 2.7-5.5 5.5-5.5s5 1.9 5.5 5.5" />
        <path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 14.8c1.8.7 2.8 2.4 3 5.2" />
      </svg>
    );
  }
  if (label === "Caixa") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="13" rx="2.5" />
        <path d="M3 10h18M16 14.5h2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav({
  isSolo,
  canManageTenant,
  hasProfessional,
}: {
  isSolo: boolean;
  canManageTenant: boolean;
  hasProfessional: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const leanGroups: NavGroup[] = [
    {
      title: "Operação",
      items: [
        { href: "/services", label: "Serviços" },
        { href: "/schedule", label: "Horários" },
        ...(hasProfessional
          ? [{ href: "/my-schedule", label: "Minha agenda" }]
          : []),
      ],
    },
    {
      title: "Gestão",
      items: [
        { href: "/finance", label: "Caixa" },
        { href: "/helpers", label: "Ajudante" },
        { href: "/notifications", label: "Mensagens" },
        ...(canManageTenant
          ? [
              { href: "/settings", label: "Configurações" },
              { href: "/billing", label: "Plano e cobrança" },
            ]
          : []),
      ],
    },
    {
      title: "Mais módulos",
      items: [
        { href: "/assistant", label: "Assistente IA" },
        { href: "/profile", label: "Perfil" },
      ],
    },
  ];

  const fullGroups: NavGroup[] = [
    {
      title: "Operação",
      items: [
        { href: "/services", label: "Serviços" },
        { href: "/schedule", label: "Horários" },
        { href: "/professionals", label: "Profissionais" },
        ...(hasProfessional
          ? [{ href: "/my-schedule", label: "Minha agenda" }]
          : []),
      ],
    },
    {
      title: "Gestão",
      items: [
        { href: "/finance", label: "Financeiro" },
        { href: "/reconciliation", label: "Conciliação" },
        { href: "/reports", label: "Relatórios" },
        ...(canManageTenant
          ? [
              { href: "/closing", label: "Fechamento" },
              { href: "/settings", label: "Configurações" },
              { href: "/billing", label: "Plano e cobrança" },
            ]
          : []),
        { href: "/notifications", label: "Mensagens" },
      ],
    },
    {
      title: "Equipe e comercial",
      items: [
        { href: "/assistant", label: "Assistente IA" },
        { href: "/branches", label: "Filiais" },
        { href: "/team", label: "Equipe" },
        { href: "/products", label: "Produtos" },
        { href: "/inventory", label: "Estoque" },
        { href: "/packages", label: "Pacotes" },
        { href: "/subscriptions", label: "Assinaturas" },
        { href: "/coupons", label: "Cupons" },
        { href: "/loyalty", label: "Fidelidade" },
        { href: "/profile", label: "Perfil" },
      ],
    },
  ];

  const groups = isSolo ? leanGroups : fullGroups;

  const primaryActive = PRIMARY.some((item) => isActive(pathname, item.href));

  return (
    <>
      <nav
        aria-label="Navegação mobile"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
      >
        <div className="grid grid-cols-5">
          {PRIMARY.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium ${
                  active ? "text-brand" : "text-foreground/60"
                }`}
              >
                {iconFor(item.label)}
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium ${
              !primaryActive || open ? "text-brand" : "text-foreground/60"
            }`}
          >
            {iconFor("Mais")}
            Mais
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label="Todos os módulos">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-3xl border-t border-white/70 bg-white/95 p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-brand">
                  {isSolo ? "Modo solo" : "Todos os módulos"}
                </p>
                <h2 className="mt-1 text-lg font-semibold">Ir para</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground/70"
              >
                Fechar
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {groups.map((group) => (
                <section key={group.title}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                    {group.title}
                  </h3>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {group.items.map((item) => {
                      const active = isActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`rounded-xl border px-3 py-2.5 text-sm ${
                            active
                              ? "border-brand/40 bg-brand/10 font-medium text-brand"
                              : "border-border bg-white/70 text-foreground/80"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
