# GlowHub — Escopo e Status do Projeto

> Documento de referência para o time. Une **visão de negócio** e **técnica**:
> o que o produto é, para quem, como está construído, o que falta e como
> **retomar o trabalho** (handoff).

- Repositório: privado (`torinoorbit-dev/glowhub`).
- Estágio: **MVP interno funcional** (Fases 0–5 concluídas; Fase 6 parcial).
  Ainda **não pronto para produção** (ver backlog e riscos).
- Última atualização: alinhada ao estado atual do código.

---

## 1. Visão de negócio

### 1.1 Problema e oportunidade
Salões, barbearias, clínicas de estética e spas operam com agenda em papel/planilha,
WhatsApp e sistemas que **não conversam com o financeiro**. Isso gera overbooking,
no-show, preços inconsistentes entre filiais, comissões na mão e falta de visão de
caixa. O GlowHub ataca isso como um **SaaS multi-tenant** de agendamento + gestão,
com um **financeiro contábil de verdade** (partidas dobradas) como diferencial.

### 1.2 Público-alvo
Negócios de agendamento com profissionais e venda de produtos: salões, barbearias,
estúdios unissex, clínicas de estética, spas, nail design, sobrancelhas/cílios e
massagem. Do **autônomo com 1 cadeira** à **rede com várias filiais**.

### 1.3 Proposta de valor
- Agenda e disponibilidade por **profissional e filial**, com bloqueios.
- Catálogo de **serviços e produtos** com preço/duração por filial.
- **Financeiro auditável** (livro imutável, centavos, idempotência).
- **Multi-tenant** seguro por padrão (isolamento por RLS no banco).
- **Agendamento online** (canal público) por subdomínio.

### 1.4 Modelo de negócio (hipóteses)
- **Assinatura por tenant** (SaaS), com planos por filiais/profissionais/usuários.
  (Planos de billing da própria plataforma ainda **não implementados** — hoje há
  planos de assinatura vendidos *ao cliente final do salão*.)
- Receita adicional possível: taxas sobre pagamentos online (gateway a definir).

### 1.5 Personas e papéis
Papéis por tenant: **owner, admin, manager, staff, viewer**.

| Persona | O que faz no sistema |
|---|---|
| Dono (owner) | Configura empresa, preços, equipe, vê financeiro e relatórios. |
| Gerente (manager) | Opera filiais, catálogo, agenda e equipe. |
| Recepção / staff | Agenda, check-in/checkout, cobrança, clientes. |
| Profissional | **Minha agenda** (`/my-schedule`): agenda do dia/semana e confirma/inicia/conclui os próprios atendimentos. |
| Cliente final | **Agendamento online** em `/book`; app mobile pendente. |

### 1.6 Escopo funcional (módulos)

| Módulo | Descrição | Status |
|---|---|---|
| Fundação & Tenancy | Empresas, filiais, vínculos, papéis | ✅ |
| Autenticação | Login/cadastro, sessão, logout, aceite de convite | ✅ (verificação de e-mail pendente) |
| Onboarding | Cadastro cria empresa + filial + owner | ✅ |
| Equipe & Convites | Convidar por link, papéis, troca de empresa ativa | ✅ (envio de e-mail pendente) |
| Filiais | Criar/editar/ativar-desativar | ✅ |
| Catálogo | Categorias, serviços, produtos (variações/estoque), profissionais | ✅ |
| Preços por filial | Override de preço/duração e disponibilidade | ✅ |
| Agenda | Horários, intervalos, feriados, disponibilidade | ✅ |
| Agendamentos | Reserva + status (pendente→confirmado→check-in→checkout→concluído) | ✅ |
| Clientes | Cadastro + **histórico dedicado** (atendimentos, cobranças/pagamentos, carteira) | ✅ |
| Financeiro | Plano de contas, ledger, cobrança, pagamentos, comissão/gorjeta/repasse, carteira, cupons, **conciliação** | ✅ (gateway online e fechamento pendentes) |
| Pacotes & Assinaturas | Pré-pago e recorrente, com ledger | ✅ (consumo por período pendente) |
| Notificações | Caixa de saída + e-mail (adapter portável) | 🟡 (push/lembretes agendados pendentes) |
| Canal cliente | Agendamento online `(/book)`; app mobile | 🟡 |
| Relatórios | Balancete, resultado, receita/dia, recebimentos por forma, **ocupação por profissional** | ✅ (fechamento formal pendente) |

Legenda: ✅ pronto · 🟡 parcial · ⛔ não iniciado.

---

## 2. Escopo técnico

### 2.1 Stack
- **Next.js 16** (App Router, Turbopack, Server Actions) + **React 19** +
  **TypeScript** na **Vercel**.
- **Neon (Postgres)** + **Row Level Security (RLS)** como isolamento.
- **Better Auth self-hosted** (tabelas `user`/`session`/`account`/`verification`
  no banco) — escolhido por **portabilidade**.
- **Drizzle ORM** (schema e queries) + **Zod** (validação) + **Tailwind v4**.
- **Vitest** (unitários) e **Playwright** (e2e) para testes; **GitHub Actions**
  para CI.

### 2.2 Arquitetura
```
Browser ──► Next (RSC + Server Actions)
              │  Better Auth (app/api/auth/[...all])
              │
              ├─ getDb()             → role owner  (auth, admin, canal público, ignora RLS)
              └─ withUser(userId, cb) → role app   (queries do usuário, RLS via set_config)
                                          │
                                Neon Postgres (RLS + ledger)
```
- `src/proxy.ts` resolve o **tenant por subdomínio** (`<slug>.dominio`,
  `DEFAULT_TENANT_SLUG`/`?tenant=` em dev).
- O app é **100% server-side** para dados.

### 2.3 Multi-tenancy e segurança
- `tenant_id` em todas as tabelas de domínio + **RLS**.
- Role do app (`glowhub_app`, **sem `BYPASSRLS`**) recebe, por transação,
  `set_config('request.jwt.claims', '{"sub": <userId>}')`; policies usam
  `public.auth_uid()`, `is_tenant_member`, `has_tenant_role`.
- Tenant ativo em `profiles.active_tenant_id`.
- **Canal público** (`/book`, `/api/webhooks/*`) usa `getDb()` (owner) com
  **escopo explícito por `tenant_id`** — decisão consciente.
- Convites: `SECURITY DEFINER` (`accept_invitation`).

### 2.4 Modelo de dados (por domínio)
- **Auth:** `user`, `session`, `account`, `verification`.
- **Tenancy:** `tenants`, `branches`, `memberships`, `invitations`, `profiles`.
- **Catálogo:** `categories`, `services`, `service_branches`, `professionals`,
  `professional_branches`, `professional_services`.
- **Produtos:** `products`, `product_variants`.
- **Agenda:** `branch_hours`, `professional_hours`, `branch_closures`.
- **Atendimento:** `clients`, `appointments` (status + *exclusion constraint*).
- **Financeiro:** `ledger_accounts`, `journal_entries`, `journal_lines`,
  `charges`, `charge_items`, `payments`, `webhook_events`, `earnings`, `payouts`,
  `wallet_transactions`.
- **Comercial:** `packages`/`package_items`/`client_packages`/`package_redemptions`,
  `subscription_plans`/`plan_items`/`client_subscriptions`,
  `coupons`/`coupon_redemptions`.
- **Comunicação:** `notifications` (caixa de saída).

### 2.5 Financeiro (princípios e estado)
- **Partidas dobradas**, **append-only** (sem UPDATE/DELETE para a role do app;
  trigger bloqueando `UPDATE`), **balanceado** (constraint trigger deferido).
- **Idempotência** por `idempotency_key` (pagamentos, cobranças, etc.).
- Fluxos implementados: cobrança (D Receber / C Receita), pagamento
  (D Caixa/Banco / C Receber), comissão (D Despesa Comissão / C Comissão a Pagar),
  gorjeta (C Gorjetas a Pagar), repasse (D Comissão+Gorjeta a Pagar / C Caixa),
  carteira (D Caixa / C Carteira; pagamento com carteira), cupom (D Descontos /
  C Receber), pacote (D Caixa / C Pacotes a Resgatar; resgate D Pacotes / C Receita),
  assinatura (D Caixa / C Receita de Assinaturas).
- **Falta:** gateway online + webhooks assinados + conciliação automática,
  estorno/void formal, fechamento contábil e reconhecimento diferido de receita.

### 2.6 Convenções
- Schema Drizzle em `src/db/schema` é a **fonte de verdade**; funções, triggers,
  policies e grants em `db/rls.sql`.
- **Ordem ao mexer no schema:** `npx drizzle-kit push` **e depois** aplicar
  `db/rls.sql`.
- Dinheiro sempre em centavos; sem lógica de dinheiro no client.
- Quality gate: `npx tsc --noEmit`, `npx eslint .`, `npm test`, `npm run build`.
- e2e: `npm run test:e2e` (Playwright; sobe o dev server e exige `.env.local`
  configurado e `npm run seed:demo` executado). Instale o navegador uma vez com
  `npm run test:e2e:install`.

### 2.7 Setup de desenvolvimento (onboarding do dev)
1. `npm install`
2. `.env.local` a partir de `.env.example`:
   `DATABASE_URL`, `DATABASE_AUTHENTICATED_URL`, `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL` (opcional: `RESEND_API_KEY`, `EMAIL_FROM`).
3. Aplicar schema/RLS/seed:
   `npx drizzle-kit push`
   → `node --env-file=.env.local scripts/apply-sql.mjs db/rls.sql`
   → `... db/seed.sql`
   → **`npm run seed:demo`** (cenário demo completo: catálogo, agenda,
   financeiro com ledger balanceado, pacotes/assinatura/cupons, notificações).
4. `npm run dev`; cadastrar em `/login`; criar a empresa em `/onboarding`.
- Scripts: `scripts/apply-sql.mjs`, `scripts/smoke-rls.mjs`, `scripts/smoke-ledger.mjs`.

### 2.8 Infra & deploy
- **Vercel** + **Neon**; **CI** (lint/typecheck/test/build) no GitHub Actions.
- **Produção:** https://glowhub-silk.vercel.app (também
  `glowhub-torinoorbit-dev.vercel.app`). Env de produção configuradas
  (`DATABASE_URL` pooled).
- **Conta demo:** botão *"Entrar com conta demo"* na tela de login. Vincula o
  usuário como **owner de 3 tenants** (`demo`, `studio-bella`, `clinica-lumina`)
  → use o seletor **Empresa**. Também vincula a um profissional de `demo`,
  habilitando a visão **Minha agenda**. Desativável com
  `NEXT_PUBLIC_DEMO_LOGIN=false`.
- **Dados demo:** `npm run seed:demo` recria os 3 tenants com cenário completo e
  ledger balanceado (catálogo, agenda, financeiro, pacotes, assinatura, cupons,
  gateway mock). Idempotente (não toca em outros dados).
- **Conciliação:** `/reconciliation` casa cobrança ↔ pagamento ↔ gateway e permite
  confirmar pagamentos pendentes (efeito de webhook).

---

## 3. Status atual (o que está pronto)
Rotas: `/`, `/login`, `/invite/[token]`, `/onboarding`, `/dashboard`,
`/branches`, `/services`, `/products`, `/professionals`, `/schedule`,
`/appointments`, `/my-schedule`, `/clients`, `/clients/[id]`, `/packages`,
`/subscriptions`, `/coupons`, `/notifications`, `/finance`, `/reconciliation`,
`/reports`, `/book`, `/api/auth/[...all]`, `/api/webhooks/[provider]`.

- Auth/sessão, convites por link, troca de empresa, **onboarding**.
- Catálogo completo com overrides por filial; agenda e **disponibilidade**;
  **agendamentos**; **clientes**.
- **Financeiro** completo no núcleo: ledger, cobrança, pagamentos idempotentes,
  comissão/gorjeta/repasse, carteira, cupons, pacotes, assinaturas, relatórios.
- **Agendamento online** e **notificações por e-mail** (caixa de saída).
- **CI** + **23 testes unitários** e **5 testes e2e** (Playwright: login demo,
  minha agenda + mudança de status, histórico do cliente, booking); `tsc`/`eslint`/
  `build` verdes.

---

## 4. O que falta (backlog priorizado)

### Fase 6 — Canais
- [ ] **App do cliente (mobile)** — projeto separado (Expo/React Native), consumindo
      a mesma API/DB (avaliar expor uma API dedicada ou usar o Supabase-like).

### Financeiro / comercial
- [ ] **Gateway online** (Stripe/Mercado Pago/Pagar.me) + webhooks assinados +
      conciliação automática; estorno/void.
- [ ] **Recorrência automática de assinaturas** (agendador) e **consumo/limites**
      por período (pacotes e assinaturas).
- [ ] **Fechamento** contábil e reconhecimento de receita diferida.

### Comunicação
- [ ] **Agendador** (pg_cron/Inngest) para **lembretes** de agendamento.
- [ ] **Verificação de e-mail** no cadastro e envio por e-mail dos **convites**.
- [ ] Canais **push/SMS**.

### Produto
- [x] **Visão do profissional** (agenda própria `/my-schedule`, com mudança de
      status dos próprios atendimentos) e **histórico por cliente**
      (`/clients/[id]`).
- [ ] **Paginação/busca** nas listas.
- [ ] **Edição/remoção de membros** da equipe.
- [ ] Políticas de **cancelamento/no-show** por tenant.
- [ ] **Storage de arquivos** (logo/imagens por tenant; hoje só URL).

### Transversal / produção
- [x] Onboarding de tenant; CI; testes unitários; e-mail (caixa de saída).
- [x] **e2e** (Playwright) dos fluxos críticos: login demo, minha agenda
      (vínculo + status), histórico do cliente e booking público. Workflow
      `e2e.yml` manual (usa secrets de banco).
- [ ] **Observabilidade** (logs, métricas, alertas de pagamento).
- [ ] **Deploy na Vercel** + env de produção + domínio/subdomínios.
- [ ] **Segurança**: revisão de policies, **rate limiting**, proteção das rotas
      do Better Auth.
- [ ] Revisão de **acessibilidade** e i18n (hoje só pt-BR).

---

## 5. Riscos e considerações
- **Produção**: falta e-mail de verificação, CI/CD de deploy, observabilidade e
  revisão de segurança.
- **Financeiro**: mudanças exigem cuidado (imutável, balanceado, idempotente);
  novos lançamentos devem passar por `src/lib/ledger.ts`.
- **Gateway**: escolha e desenho de webhooks ainda em aberto.
- **RLS vs. canal público**: o `/book` usa a conexão admin com escopo explícito;
  manter essa disciplina ao evoluir.

---

## 6. Retomada (handoff) — como continuar em uma nova sessão

1. **Repositório**: `git clone`/`git pull`; branch `master`.
2. **Dependências**: `npm install`.
3. **Env**: criar `.env.local` a partir de `.env.example` (Neon owner + role do
   app + `BETTER_AUTH_SECRET`). Ver `docs/neon-migration.md` para o setup do Neon.
4. **Banco**: `npx drizzle-kit push` → aplicar `db/rls.sql` → `db/seed.sql`
   (via `scripts/apply-sql.mjs`) → `npm run seed:demo` (cenário demo).
5. **Qualidade**: `npx tsc --noEmit` && `npx eslint .` && `npm test` && `npm run build`.
6. **e2e** (opcional): `npm run test:e2e:install` uma vez; depois `npm run test:e2e`
   (sobe o dev server; exige `.env.local` e seed demo).
7. **Smoke**: `node --env-file=.env.local scripts/smoke-rls.mjs` e `...smoke-ledger.mjs`.
8. **Rodar**: `npm run dev` (app em `/dashboard`; público em `/book`).

Pontos de entrada úteis:
- Multi-tenancy/RLS: `src/lib/db.ts`, `src/lib/tenant.ts`, `db/rls.sql`.
- Auth: `src/lib/auth.ts`, `src/lib/session.ts`, `src/app/api/auth/[...all]/route.ts`.
- Financeiro: `src/lib/ledger.ts`, `src/app/(app)/finance/*`.
- Disponibilidade: `src/lib/availability.ts`, `src/lib/availability-data.ts`.
- Booking público: `src/app/book/*`.
- Visão do profissional: `src/app/(app)/my-schedule/*` + vínculo em
  `src/app/(app)/professionals/*` (`professionals.user_id`).
- Histórico do cliente: `src/app/(app)/clients/[id]/page.tsx`.
- e2e: `e2e/*.spec.ts`, `e2e/auth.setup.ts`, `playwright.config.ts`.

Decisões em aberto (ver `docs/architecture.md`): provedor de **pagamento**,
**e-mail** de verificação/convites, **storage**, e estratégia de **API** para o app
mobile.

## 7. Glossário
- **Tenant**: empresa cliente do SaaS. **Branch**: filial.
- **Membership**: vínculo usuário↔tenant com papel.
- **Charge (cobrança)**: valor a receber por um atendimento.
- **Ledger**: livro-razão de partidas dobradas (imutável).
- **RLS**: Row Level Security (isolamento por linha no Postgres).
