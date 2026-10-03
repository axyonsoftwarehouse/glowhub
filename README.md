# GlowHub

Plataforma **multi-tenant** de agendamento e gestão para salões, barbearias,
clínicas de estética e spas. Base construída sobre **Next.js 16 (App Router)** +
**Vercel** + **Neon (Postgres)** + **Better Auth** + **Drizzle**, pronta para
evoluir com um **financeiro contábil** (partidas dobradas) e app do cliente.

> Este projeto é **clean-room**: não reutiliza código, layout ou assets de
> terceiros licenciados.

## Arquitetura

- **Tenant (empresa)** → N **Branches (filiais)** → **Memberships** (usuário +
  papel por tenant).
- **Isolamento de dados**: `tenant_id` em todas as tabelas + **Row Level Security
  (RLS)** no Postgres. O app conecta com uma role **sem `BYPASSRLS`** e injeta
  `request.jwt.claims` (`{ sub }`) por transação; as policies usam
  `public.auth_uid()`.
- **Resolução de tenant**: por **subdomínio** (`<slug>.SEU_DOMINIO`) no
  `src/proxy.ts`; em localhost, usa `DEFAULT_TENANT_SLUG` ou `?tenant=<slug>`. O
  tenant ativo do usuário fica em `profiles.active_tenant_id`.
- **Acesso a dados**: **Drizzle** em tudo (server-side). Conexão admin
  (`DATABASE_URL`, owner) para auth/migrations; conexão `DATABASE_AUTHENTICATED_URL`
  (role app) para queries do usuário, com RLS.
- **Auth**: **Better Auth self-hosted** (`better-auth`) dentro do Next, tabelas no
  próprio banco (schema `public`).

## Estrutura

```
src/
  proxy.ts                     # resolução de tenant por subdomínio
  lib/
    env.ts                     # leitura/validação de env
    db.ts                      # getDb (admin) + withUser (RLS por transação)
    auth.ts                    # Better Auth (server)
    auth-client.ts             # Better Auth (client)
    session.ts                 # getSession/getUser
    tenant.ts                  # resolve o tenant atual
  db/
    schema/*.ts                # schema Drizzle (tenancy, catálogo, agenda...)
  app/
    api/auth/[...all]/route.ts # handler do Better Auth
    page.tsx                   # landing
    (auth)/login/              # login/cadastro
    (app)/dashboard/           # shell autenticado + visão geral
    (app)/branches|services|products|professionals/
    (app)/schedule|appointments|clients|team|profile/
    invite/[token]/            # aceite de convite
db/
  rls.sql                      # funções, triggers, RLS e grants
  seed.sql                     # tenant/filial de exemplo
```

## Configuração

### 1. Criar o projeto Neon
1. Crie um projeto em https://console.neon.tech (região AWS).
2. Copie a connection string do **owner** (`neondb_owner`) → `DATABASE_URL`
   (host **sem** `-pooler`, para migrations).
3. Rode o SQL abaixo no **SQL Editor** para criar a role do app:
```sql
create role glowhub_app with login password 'TROQUE_ESTA_SENHA';
grant usage on schema public to glowhub_app;
grant select, insert, update, delete on all tables in schema public to glowhub_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to glowhub_app;
grant usage, select on all sequences in schema public to glowhub_app;
```
4. Monte `DATABASE_AUTHENTICATED_URL` com a role `glowhub_app` (host **com**
   `-pooler`).

### 2. Variáveis de ambiente
```bash
cp .env.example .env.local
```
Preencha `DATABASE_URL`, `DATABASE_AUTHENTICATED_URL`, `BETTER_AUTH_SECRET`
(`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
e `BETTER_AUTH_URL`.

### 3. Aplicar o schema
```bash
npx drizzle-kit push          # cria as tabelas
node --env-file=.env.local scripts/apply-sql.mjs db/rls.sql   # RLS, funções, grants
node --env-file=.env.local scripts/apply-sql.mjs db/seed.sql  # dados de exemplo
```

### 4. Criar usuário e vinculá-lo ao tenant
1. Cadastre-se pela tela `/login` (Better Auth cria o usuário).
2. Vincule como `owner` do tenant de exemplo:
```sql
insert into public.memberships (tenant_id, user_id, role)
select t.id, u.id, 'owner'
from public.tenants t, public."user" u
where t.slug = 'demo' and u.email = 'voce@exemplo.com'
on conflict (tenant_id, user_id) do update set role = 'owner';
```

### 5. Rodar
```bash
npm run dev
```
Acesse: http://localhost:3000/dashboard

## Segurança (RLS)
- O app usa a role `glowhub_app` (sem `BYPASSRLS`). `withUser(userId, cb)` abre
  uma transação e faz `set_config('request.jwt.claims', '{"sub": userId}', true)`;
  as policies usam `public.auth_uid()`.
- `tenants`: leitura pública de ativos (branding); escrita `owner/admin`.
- Demais tabelas de domínio: leitura por membros; escrita por papel (catálogo:
  `owner/admin/manager`; agenda/clientes: também `staff`).
- **Aceite de convite** via `SECURITY DEFINER` (`public.accept_invitation`).
- A conexão admin (`DATABASE_URL`) ignora RLS — use só no servidor.

## Status
- [x] Projeto Next 16 + Tailwind + TypeScript + Neon + Drizzle + Better Auth
- [x] Tenancy + RLS por `auth_uid()`
- [x] Resolução de tenant por subdomínio
- [x] Auth (login/cadastro/logout) + perfil e troca de tenant ativa
- [x] Filiais, catálogo (serviços, produtos, profissionais) e agenda
- [x] Agendamentos e clientes
- [x] Financeiro: plano de contas + ledger de partidas dobradas (append-only)
- [x] Financeiro: cobrança de atendimento (gera receita + contas a receber)
- [x] Financeiro: pagamentos idempotentes (offline) + webhooks + conciliação
- [x] Financeiro: comissão, gorjeta e repasses ao profissional
- [x] Financeiro: carteira do cliente (crédito pré-pago) e relatórios (balancete/resultado)
- [x] Pacotes (pré-pago) e assinaturas (planos recorrentes) com ledger
- [x] Cupons/promoções (desconto em cobranças abertas, com ledger)
- [x] Website público / agendamento online (`/book`)
- [x] Onboarding de tenant (cadastro cria empresa) + CI (lint/typecheck/build)
- [ ] App mobile, notificações, gateway online e testes
- [ ] Notificações, website público e app do cliente
