// Snapshot deterministico do schema `public` (so leitura), para comparar dois
// bancos com `git diff --no-index`. Substitui o pg_dump --schema-only.
// Rodar: node --env-file=.env.local scripts/schema-snapshot.mjs > snapshot.txt

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL nao definido.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

const sections = {
  extensoes: sql`select extname as line from pg_extension`,
  enums: sql`
    select t.typname || ': ' || string_agg(e.enumlabel, ', ' order by e.enumsortorder) as line
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    group by t.typname`,
  colunas: sql`
    select table_name || '.' || column_name || ' ' || data_type
      || case when data_type = 'USER-DEFINED' then '(' || udt_name || ')' else '' end
      || case when data_type = 'ARRAY' then '(' || udt_name || ')' else '' end
      || case when is_nullable = 'NO' then ' not null' else '' end
      || coalesce(' default ' || column_default, '') as line
    from information_schema.columns
    where table_schema = 'public'`,
  rls: sql`
    select c.relname || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity as line
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'`,
  constraints: sql`
    select c.conrelid::regclass::text || ' ' || c.conname || ': ' || pg_get_constraintdef(c.oid) as line
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public' and c.conrelid <> 0`,
  indices: sql`
    select indexdef as line from pg_indexes where schemaname = 'public'`,
  policies: sql`
    select tablename || ' ' || policyname || ' ' || cmd || ' ' || array_to_string(roles, ',')
      || ' using(' || coalesce(qual, '') || ') check(' || coalesce(with_check, '') || ')' as line
    from pg_policies where schemaname = 'public'`,
  triggers: sql`
    select pg_get_triggerdef(t.oid) as line
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal`,
  funcoes: sql`
    select pg_get_functiondef(p.oid) as line
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where n.nspname = 'public' and p.prokind in ('f', 'p') and d.objid is null`,
  grants: sql`
    select table_name || ' ' || grantee || ' ' || privilege_type as line
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'glowhub_app'`,
};

try {
  const out = [];
  for (const [name, query] of Object.entries(sections)) {
    const rows = await query;
    const lines = rows.map((r) => r.line).sort((a, b) => a.localeCompare(b));
    out.push(`## ${name}`, ...lines, "");
  }
  process.stdout.write(out.join("\n"));
} finally {
  await sql.end();
}
