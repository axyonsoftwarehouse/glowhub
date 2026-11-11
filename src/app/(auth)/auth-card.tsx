export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main
      id="conteudo"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16"
    >
      <div className="mb-8 text-center">
        <span className="text-lg font-semibold tracking-tight">
          Glow<span className="text-brand">Hub</span>
        </span>
        <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-foreground/60">{subtitle}</p>}
      </div>
      {children}
    </main>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export const primaryButtonClass =
  "mt-5 w-full rounded-full bg-brand px-4 py-2.5 font-medium text-brand-foreground disabled:opacity-60";
