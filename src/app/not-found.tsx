import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main
      id="conteudo"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16 text-center"
    >
      <p className="text-sm font-medium uppercase tracking-widest text-brand">Erro 404</p>
      <h1 className="mt-3 text-2xl font-semibold">Página não encontrada</h1>
      <p className="mt-3 text-foreground/70">
        O endereço pode ter mudado ou o link está incompleto. Confira a URL ou volte para o início.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          href="/"
          className="rounded-full bg-brand px-6 py-3 font-medium text-brand-foreground transition hover:opacity-90"
        >
          Ir para o início
        </Link>
        <Link
          href="/dashboard"
          className="rounded-full border border-border bg-white/60 px-6 py-3 font-medium transition hover:bg-white"
        >
          Abrir o painel
        </Link>
      </div>
    </main>
  );
}
