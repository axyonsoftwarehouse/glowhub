export function SetupNotice() {
  return (
    <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
      <h2 className="text-base font-semibold">Configure o banco e a autenticação</h2>
      <p className="mt-2 text-foreground/70">
        Crie <code className="font-mono">.env.local</code> a partir de{" "}
        <code className="font-mono">.env.example</code> e preencha:
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 font-mono text-xs text-foreground/80">
        <li>DATABASE_URL (Neon, role owner)</li>
        <li>DATABASE_AUTHENTICATED_URL (role de app, sem BYPASSRLS)</li>
        <li>BETTER_AUTH_SECRET</li>
        <li>BETTER_AUTH_URL</li>
        <li>NEXT_PUBLIC_ROOT_DOMAIN (ex.: glowhub.app)</li>
        <li>DEFAULT_TENANT_SLUG (ex.: demo — usado em localhost)</li>
      </ul>
      <p className="mt-4 text-foreground/70">
        Depois rode <code className="font-mono">drizzle-kit push</code> e o{" "}
        <code className="font-mono">db/rls.sql</code>. Instruções em{" "}
        <code className="font-mono">docs/neon-migration.md</code>.
      </p>
    </div>
  );
}
