import Link from "next/link";

const features = [
  {
    title: "Multi-tenant de verdade",
    body: "Cada empresa (tenant) tem seus próprios dados, isolados por Row Level Security no Postgres.",
  },
  {
    title: "Filiais por tenant",
    body: "Um tenant pode ter várias unidades, com agenda, equipe e configurações próprias.",
  },
  {
    title: "Financeiro contábil",
    body: "Base preparada para lançamentos de partidas dobradas, idempotência e conciliação.",
  },
  {
    title: "Feito para beleza",
    body: "Agendamento, serviços, profissionais, pacotes e venda de produtos em um só lugar.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-16">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">
          Glow<span className="text-brand">Hub</span>
        </span>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            href="/login"
            className="rounded-full bg-brand px-4 py-2 font-medium text-brand-foreground"
          >
            Entrar
          </Link>
        </nav>
      </header>

      <section className="mt-20 max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-widest text-brand">
          Plataforma SaaS para beleza e estética
        </p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
          Um sistema, várias empresas, cada uma com suas filiais.
        </h1>
        <p className="mt-6 text-lg text-foreground/70">
          O GlowHub nasce como uma base multi-tenant sobre Next.js, Vercel e
          Supabase — com isolamento por RLS e um núcleo financeiro pensado para
          auditoria.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/login"
            className="rounded-full bg-brand px-6 py-3 font-medium text-brand-foreground"
          >
            Acessar o painel
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-border px-6 py-3 font-medium"
          >
            Ver o dashboard
          </Link>
        </div>
      </section>

      <section className="mt-20 grid gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <article
            key={feature.title}
            className="rounded-2xl border border-border bg-white/60 p-6"
          >
            <h2 className="font-semibold">{feature.title}</h2>
            <p className="mt-2 text-sm text-foreground/70">{feature.body}</p>
          </article>
        ))}
      </section>

      <footer className="mt-20 border-t border-border pt-6 text-sm text-foreground/50">
        GlowHub — fundação multi-tenant. Documentação em{" "}
        <code className="font-mono">README.md</code>.
      </footer>
    </main>
  );
}
