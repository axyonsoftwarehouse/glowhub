# Migração Supabase → Neon + Better Auth

Status: **concluída** (Neon + Better Auth + Drizzle; Supabase removido).

## Arquitetura alvo

- **Banco**: Neon Postgres.
- **Identidade**: **Better Auth self-hosted** dentro do Next (`better-auth`),
  com tabelas no próprio banco. Escolhido em vez do Neon Auth gerenciado para
  ficar **portável** (troca de Postgres não afeta a auth) e ter controle total
  (plugins/hooks/`additionalFields`).
- **Acesso a dados**: **Drizzle** em tudo (o app é 100% server-side).
  - `DATABASE_URL` (`neondb_owner`) → migrations/admin, **ignora RLS**.
  - `DATABASE_AUTHENTICATED_URL` (role de login **sem `BYPASSRLS`**) → queries do
    app, **com RLS**. Claims injetados por transação via
    `set_config('request.jwt.claims', …)`.
- **Não usamos** Neon Data API nem `@neondatabase/neon-js`.

### Contexto de tenant
- `profiles.active_tenant_id` guarda o tenant ativo (troca = UPDATE; sem refresh
  de JWT).
- `getAuthenticatedDb(session)` injeta `{ sub, tenant_id }` nos claims;
  `auth_uid()` / `current_tenant_id()` leem `request.jwt.claims`.
- Papéis de tenant seguem em `memberships` (`is_tenant_member`,
  `has_tenant_role`).

## Setup no Neon Console

Better Auth é self-hosted: **não habilite Managed Better Auth**. O projeto é só
Postgres.

1. Criar o projeto Neon (qualquer região).
2. Copiar a connection string do **owner** (`neondb_owner`) → `DATABASE_URL`.
3. Criar a role de app e a connection string dela → `DATABASE_AUTHENTICATED_URL`
   (SQL abaixo; rodar no SQL Editor).

```sql
-- Role de login para o app (aplica RLS)
create role glowhub_app with login password 'TROQUE_ESTA_SENHA';
grant usage on schema public to glowhub_app;
grant select, insert, update, delete on all tables in schema public to glowhub_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to glowhub_app;
grant usage, select on all sequences in schema public to glowhub_app;
```

## Setup do Better Auth

1. Env: `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) e `BETTER_AUTH_URL`.
2. Gerar o schema Drizzle de auth: `npx @better-auth/cli generate`.
3. Montar `lib/auth.ts`, `app/api/auth/[...all]/route.ts` e `lib/auth/client.ts`.
4. Verificação de e-mail fica desligada no início (sem provedor de e-mail).

## Passos de código

1. **Fundação de auth**: `lib/auth.ts`, `lib/auth/client.ts`, route handler,
   `proxy.ts` com verificação de sessão.
2. **Login/cadastro/logout**: trocar `login-form.tsx` e ações.
3. **Camada de dados**: `lib/db.ts` com `getAdminDb()` e
   `getAuthenticatedDb(session)`.
4. **Migrations**: `auth.uid()` → `public.auth_uid()`; manter
   `current_tenant_id()` lendo o claim; tabelas de auth do Better Auth + role de
   app.
5. **Conversão de páginas/ações** de `supabase.from()` → Drizzle.
6. **Limpeza**: remover `@supabase/*`, `src/lib/supabase/*`, `src/db/client.ts`
   antigo; atualizar docs.

### Arquivos a converter
`lib/tenant.ts`, `(app)/layout.tsx`, `dashboard`, `branches`, `services`,
`products`, `professionals`, `schedule`, `appointments`, `clients`, `team`,
`profile`, `invite/[token]`, ações `switchTenant`/`signOut`.

## Riscos / observações
- `memberships.user_id` / `profiles.id` passam a referenciar a tabela `user` do
  Better Auth (id `text` por padrão) — harmonizar tipos (usar `text` ou gerar
  UUID).
- Verificação de e-mail é responsabilidade nossa (provedor futuro).
- Sem projeto/segredos o app não roda; o build pode ficar vermelho durante a
  conversão.
