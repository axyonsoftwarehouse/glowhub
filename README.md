# GlowHub

Plataforma **multi-tenant** de agendamento e gestão para salões, barbearias,
clínicas de estética e spas. Base construída sobre **Next.js 16 (App Router)** +
**Vercel** + **Neon (Postgres)** + **Better Auth** + **Drizzle**, pronta para
evoluir com um **financeiro contábil** (partidas dobradas) e app do cliente.

> Este projeto é **clean-room**: não reutiliza código, layout ou assets de
> terceiros licenciados.

📚 **Documentação:** [índice](docs/README.md) · [como o código funciona](docs/como-funciona.md)
· [escopo e backlog](docs/relatorio-projeto.md)

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
  proxy.ts                     # resolução de tenant por subdomínio (middleware do Next 16)
  lib/
    env.ts                     # leitura/validação de env
    db.ts                      # getDb (admin) + withUser (RLS por transação)
    auth.ts / auth-client.ts   # Better Auth (server/client)
    session.ts                 # getSession/getUser
    tenant.ts                  # tenant ativo + tenant público + profissional do usuário
    ledger.ts                  # postEntry (único caminho para o livro)
    charge-void.ts             # estorno formal de cobrança
    webhook-events.ts          # fila/retry de webhooks
    webhook-retry.ts           # backoff de tentativas
    accounting.ts              # balancete e resultado
    inventory.ts               # movimentos, custo médio, CMV
    loyalty.ts                 # pontos e gift cards
    profitability.ts           # DRE, margem e fluxo de caixa
    subscription-billing.ts    # renovação/receita diferida
    notifications.ts           # caixa de saída e envio do que está vencido
    reminders.ts               # janela e dedupe de lembretes
    payments/*                 # adapters (mock, Mercado Pago), assinatura e confirmação
    availability.ts            # cálculo puro de slots
    availability-data.ts       # slots a partir do banco
    rate-limit.ts / metrics.ts / alerts.ts / logger.ts
  db/
    schema/*.ts                # schema Drizzle (fonte de verdade das tabelas)
  app/
    api/auth/[...all]/route.ts # handler do Better Auth (+ rate limit)
    api/v1/*                   # API versionada para app mobile (ver docs/api-mobile.md)
    api/webhooks/[provider]/   # webhooks de pagamento
    api/cron/subscriptions/    # renovação diária de assinaturas
    api/cron/daily/            # webhooks + lembretes + envio de notificações
    api/health/ | api/metrics/ # health check e scrape de métricas
    page.tsx                   # landing
    (auth)/login/              # login/cadastro (+ conta demo)
    (app)/                     # shell autenticado:
      dashboard, branches, services, products, inventory, professionals,
      schedule, appointments, my-schedule, clients, clients/[id], packages,
      subscriptions, coupons, loyalty, notifications, team, finance,
      reconciliation, reports, reports/profitability, closing, settings, profile
    book/                      # agendamento online (canal público)
    invite/[token]/            # aceite de convite
    pay/mock/                  # checkout simulado (dev/teste)
db/
  rls.sql                      # funções, triggers, RLS e grants (idempotente)
  seed.sql                     # tenant/filial de exemplo
docs/
  como-funciona.md             # comportamento real do código, fluxo a fluxo
mobile/
  src/app/                     # Expo Router: login e agenda
  src/lib/api.ts               # cliente da API v1
  README.md                    # como rodar o app
```

Cada página tem um `actions.ts` com as Server Actions do módulo; os
componentes `"use client"` cuidam só da interação. O fluxo completo (sessão,
RLS, ledger, agenda) está em **[docs/como-funciona.md](docs/como-funciona.md)**.

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
npm run db:migrate            # migrations (drizzle/) + RLS, funções, grants
node --env-file=.env.local scripts/apply-sql.mjs db/seed.sql  # tenant/filial mínimo
npm run seed:demo             # (opcional) cenário demo completo (APP_ENV=dev)
```

Migrations versionadas, ambientes (demo/dev/production), `APP_ENV` e como
resetar o dev: **[docs/banco-e-ambientes.md](docs/banco-e-ambientes.md)**.
Não use `drizzle-kit push`.

O `npm run seed:demo` recria o tenant `demo` com catálogo, profissionais,
horários, clientes, agendamentos e o financeiro completo (cobranças, pagamentos,
comissões, gorjeta, repasse, carteira, pacotes, assinatura e cupons) — ideal para
testar sem montar dados à mão. É idempotente (apaga e recria só os tenants demo).

Os tenants criados pelo seed nascem **somente leitura** (`is_read_only`): dá para
navegar e agendar, mas não alterar catálogo, financeiro, equipe ou
configurações. Para liberar escrita em dev/preview, defina `DEMO_READ_ONLY=false`
(exceção de teste; o padrão é ligado).

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
- `tenants`: leitura só por membros; escrita `owner/admin`. O branding público
  (`/book`) lê pela conexão admin, com escopo de tenant.
- Demais tabelas de domínio: leitura por membros; escrita por papel (catálogo:
  `owner/admin/manager`; agenda/clientes: também `staff`).
- **Aceite de convite** via `SECURITY DEFINER` (`public.accept_invitation`).
- A conexão admin (`DATABASE_URL`) ignora RLS — use só no servidor e sempre com
  filtro explícito de `tenant_id` (auth, `/book`, webhooks, cron, seed).
- **Ledger append-only**: a role do app não tem `UPDATE`/`DELETE` e um trigger
  bloqueia alteração; um constraint trigger deferido exige débitos = créditos.
- **Modo demonstração**: os tenants do seed têm `is_read_only = true`; catálogo,
  financeiro, equipe e configurações recusam escrita no banco, enquanto agenda e
  clientes seguem liberados. `DEMO_READ_ONLY=false` desliga a trava em
  testes/preview. Detalhes em [docs/como-funciona.md](docs/como-funciona.md).

## Deploy

- **Repositório:** https://github.com/axyonsoftwarehouse/glowhub
- **Vercel:** projeto `glowhub`, branch de produção `master`, com deploy automático
  a cada push.
- As variáveis de ambiente pertencem ao projeto da Vercel (não ao repositório).

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
- [x] Onboarding de tenant (cadastro cria empresa) + CI (lint/typecheck/test/build)
- [x] Testes unitários (vitest) de dinheiro, disponibilidade, fuso, estoque,
      fidelidade e CRM; e2e (Playwright) dos fluxos críticos
- [x] Notificações por e-mail (caixa de saída em `/notifications`), convite de
      equipe por e-mail e lembretes diários
- [x] Conciliação (`/reconciliation`) e relatórios visuais (receita/dia, ocupação)
- [x] Estoque e insumos (ficha técnica, custo médio, CMV e alertas em `/inventory`)
- [x] Fidelização (gift cards, pontos e campanhas em `/loyalty`)
- [x] Fechamento contábil (`/closing`) e lucratividade/DRE (`/reports/profitability`)
- [x] Gateway online (mock + Mercado Pago) com webhooks assinados
- [x] Estorno formal de cobrança (ledger, estoque, cupom e comissão) e retry de webhooks
- [x] API v1 para app (login Bearer, agenda e booking público) — **[contrato](docs/api-mobile.md)**
- [x] Pacote mobile solo: navegação inferior, painel “Hoje”, modo solo e
      onboarding assistido
- [x] App mobile (Expo) inicial: login Bearer + agenda + ações de status + booking público — **[como rodar](mobile/README.md)**
- [ ] Push, login do cliente final e build EAS
- [ ] Verificação de e-mail, canais push/SMS e storage de arquivos
