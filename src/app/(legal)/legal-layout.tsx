import Link from "next/link";

function formatVersion(version: string): string {
  const [year, month, day] = version.split("-");
  return `${day}/${month}/${year}`;
}

export function LegalPage({
  title,
  version,
  children,
}: {
  title: string;
  version: string;
  children: React.ReactNode;
}) {
  return (
    <main id="conteudo" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Glow<span className="text-brand">Hub</span>
      </Link>
      <h1 className="mt-8 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Versão vigente desde {formatVersion(version)}
      </p>
      <article className="legal-text mt-8 space-y-4 text-[15px] leading-relaxed text-foreground/85 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </article>
      <nav
        aria-label="Documentos legais"
        className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm"
      >
        <Link href="/termos" className="text-brand hover:underline">
          Termos de Uso
        </Link>
        <Link href="/privacidade" className="text-brand hover:underline">
          Política de Privacidade
        </Link>
        <Link href="/login" className="text-brand hover:underline">
          Entrar
        </Link>
      </nav>
    </main>
  );
}
