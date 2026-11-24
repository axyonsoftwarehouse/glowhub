# GlowHub — Escopo e Status do Projeto

> Documento de referência para o time. Une **visão de negócio** e **técnica**:
> o que o produto é, para quem, como está construído, o que falta e como
> **retomar o trabalho** (handoff).

- Repositório: https://github.com/axyonsoftwarehouse/glowhub (público).
- Estágio: **MVP interno funcional** (Fases 0–8 implementadas; Fase 6 parcial —
  app mobile ainda sem push em development build e build EAS). Ainda **não
  pronto para produção** (ver backlog e riscos).
- Última atualização: **2026-11-14**, conferida contra o código do commit
  `09ba388` (assistente de IA, billing da plataforma, LGPD, auth/e-mail,
  InfinitePay e push registrado).
  Para o comportamento detalhado de cada fluxo, veja
  [`como-funciona.md`](como-funciona.md).

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
- **Assistente de IA** (`/assistant`): perguntas sobre o negócio, escrita
  assistida, análises, leitura de comprovantes e modo voz.

### 1.4 Modelo de negócio
- **Assinatura por tenant** (SaaS), com três planos em `/billing`:
  **Solo** (R$ 59,90), **Equipe** (R$ 129,90) e **Rede** (R$ 299,90), com teste
  grátis de 14 dias, tolerância de 7 dias e limites de profissionais/filiais/
  usuários (`src/lib/billing/plans.ts`). Cobrança via **Mercado Pago Assinaturas**
  (`BILLING_PROVIDER=mercadopago`) ou provedor mock; demo isenta (cortesia).
- Receita adicional possível: taxas sobre pagamentos online (gateway portável:
  mock, Mercado Pago e InfinitePay).

### 1.5 Personas e papéis
Papéis por tenant: **owner, admin, manager, staff, viewer**.

| Persona | O que faz no sistema |
|---|---|
| Dono (owner) | Configura empresa, preços, equipe, vê financeiro e relatórios. |
| Gerente (manager) | Opera filiais, catálogo, agenda e equipe. |
| Recepção / staff | Agenda, check-in/checkout, cobrança, clientes. |
| Profissional | **Minha agenda** (`/my-schedule`): agenda do dia/semana e confirma/inicia/conclui os próprios atendimentos. |
| Cliente final | **Agendamento online** em `/book` e app mobile com **login OTP** (e-mail) para ver os próprios agendamentos; push/EAS pendentes. |

### 1.6 Escopo funcional (módulos)

| Módulo | Descrição | Status |
|---|---|---|
| Fundação & Tenancy | Empresas, filiais, vínculos, papéis | ✅ |
| Autenticação | Login/cadastro, sessão, logout, recuperação de senha, verificação de e-mail (opcional) e aceite de convite | ✅ (provedor de e-mail real pendente) |
| Onboarding | Cadastro cria empresa + filial + owner (e onboarding solo com serviços/horários) | ✅ |
| Equipe & Convites | Convidar por link, papéis, editar papel/remover membro, revogar convite, troca de empresa ativa | ✅ (envio do convite por e-mail pendente) |
| Filiais | Criar/editar/ativar-desativar | ✅ |
| Catálogo | Categorias, serviços, produtos (variações/estoque), profissionais | ✅ |
| Estoque & insumos | Produtos internos (insumos) e de revenda, custo, mínimo de reposição, ficha técnica do serviço, movimentos append-only, fornecedores, entrada de estoque com custo médio, baixa automática + **CMV** na cobrança e alertas (`/inventory`) | ✅ |
| Preços por filial | Override de preço/duração e disponibilidade | ✅ |
| Agenda | Horários, intervalos, feriados, disponibilidade; busca na agenda; políticas de cancelamento/no-show por tenant | ✅ |
| Agendamentos | Reserva + status (pendente→confirmado→check-in→checkout→concluído) | ✅ |
| Clientes | Cadastro, **busca**, **histórico dedicado** (atendimentos, cobranças/pagamentos, carteira), **CRM** (aniversário, tags, preferências, segmentos, VIP, ticket, frequência, LTV, recência) | ✅ |
| Financeiro | Plano de contas, ledger, cobrança, pagamentos, comissão/gorjeta/repasse, carteira, cupons, **receita diferida**, conciliação, **fechamento contábil**, **gateway online** (link de checkout; mock + Mercado Pago + InfinitePay) | ✅ |
| Comandas | Cobrança aberta por atendimento; **adicionar/remover produtos** com receita (`revenue_product`), baixa de estoque na inclusão e estorno/devolução na remoção; pagamento até quitar | ✅ |
| Fidelização | **Gift cards** (valor fixo + código; passivo→receita no resgate), **programa de pontos** (acúmulo ao quitar a comanda, resgate como crédito na carteira) e **campanhas por segmento** (e-mail com opt-in) | ✅ |
| Pacotes & Assinaturas | Pré-pago e recorrente, com ledger, **consumo/limites por período** e **renovação automática** (cron) | ✅ |
| Notificações | Caixa de saída + e-mail (adapter Resend), lembretes diários e **registro de push** (tokens Expo por usuário/tenant) | ✅ (envio real de push e SMS pendentes) |
| Canal cliente | Agendamento online `(/book)`; app mobile com login OTP do cliente e troca de empresa | 🟡 (push/EAS pendentes) |
| Relatórios & BI | Balancete, resultado, receita/dia, recebimentos por forma, **ocupação por profissional**; **inteligência de clientes** (segmentos/RFM); **lucratividade & DRE** (margem por serviço/produto, ranking e fluxo de caixa vs. competência) | ✅ |
| Billing da plataforma | Planos Solo/Equipe/Rede, teste grátis de 14 dias, limites de profissionais/filiais/usuários, tolerância de 7 dias, bloqueio do painel e cobrança via Mercado Pago Assinaturas (`/billing`) | ✅ (validar no sandbox e confirmar preços) |
| Assistente de IA | Perguntas sobre o negócio, escrita assistida, análises, **leitura de comprovantes** Pix/cartão e **modo voz** (`/assistant`, OpenRouter) | ✅ (depende de `OPENROUTER_API_KEY`) |

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
- **OpenRouter** (assistente de IA; padrão Gemini 2.5 Flash) e **Resend**
  (e-mail; fallback para log em dev) como integrações externas.
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
- O app é **100% server-side** para dados. O assistente (`/assistant`) monta um
  resumo somente-leitura via `withUser` e chama a OpenRouter; a chave fica só no
  servidor.

### 2.3 Multi-tenancy e segurança
- `tenant_id` em todas as tabelas de domínio + **RLS**.
- Role do app (`glowhub_app`, **sem `BYPASSRLS`**) recebe, por transação,
  `set_config('request.jwt.claims', '{"sub": <userId>}')`; policies usam
  `public.auth_uid()`, `is_tenant_member`, `has_tenant_role`.
- Tenant ativo em `profiles.active_tenant_id`.
- **Canal público** (`/book`, `/api/webhooks/*`) usa `getDb()` (owner) com
  **escopo explícito por `tenant_id`** — decisão consciente. No `/book`, o tenant
  vem só do host (`getPublicTenant`), nunca de header/query.
- **Cliente final (OTP)**: o código é guardado como HMAC-SHA256 (tenant+e-mail,
  10 min, 5 tentativas) e a sessão como SHA-256 (30 dias); `/api/v1/client/*`
  usa `getDb()` com escopo explícito de tenant. O e-mail é a identidade do
  cliente no tenant.
- **Convites**: `SECURITY DEFINER` (`accept_invitation`).
- **Modo demonstração**: tenants do seed têm `is_read_only = true`; um trigger
  (`enforce_readonly_tenant`) bloqueia escrita em catálogo/configuração/
  financeiro/equipe, mas libera `clients`/`appointments`. Detalhes em
  [`como-funciona.md`](como-funciona.md#44-modo-demonstração-somente-leitura).
- **Rate limiting**: fixed-window em `rate_limits` (tabela interna, role do app
  revogada) aplicado ao sign-in/sign-up via `src/app/api/auth/[...all]`;
  fail-open. Logger estruturado em `src/lib/logger.ts`; `/api/health`.

### 2.4 Modelo de dados (por domínio)
- **Auth:** `user`, `session`, `account`, `verification`.
- **Tenancy:** `tenants` (inclui `is_read_only`, `is_solo` e políticas de
  cancelamento/no-show), `branches`, `memberships`, `invitations`, `profiles`.
- **Catálogo:** `categories`, `services`, `service_branches`, `professionals`,
  `professional_branches`, `professional_services`.
- **Produtos e estoque:** `products`, `product_variants`, `suppliers`,
  `stock_movements`, `service_materials`.
- **Agenda:** `branch_hours`, `professional_hours`, `branch_closures`.
- **Atendimento:** `clients`, `appointments` (status + *exclusion constraint* `appointments_no_overlap`, migration `0002`).
- **Financeiro:** `ledger_accounts`, `journal_entries`, `journal_lines`,
  `accounting_periods` (fechamento), `charges`, `charge_items`, `payments`,
  `webhook_events`, `earnings`, `payouts`, `wallet_transactions`.
- **Infra:** `rate_limits` (rate limiting interno).
- **Comercial:** `packages`/`package_items`/`client_packages`/`package_redemptions`,
  `subscription_plans`/`plan_items`/`client_subscriptions`/`subscription_redemptions`,
  `coupons`/`coupon_redemptions`.
- **Fidelização:** `gift_cards`/`gift_card_redemptions`, `loyalty_settings`,
  `loyalty_points`, `campaigns`.
- **Notificações:** `notifications` (caixa de saída), `push_tokens` (tokens Expo
  por usuário/tenant).
- **Billing da plataforma:** `platform_subscriptions`, `platform_payments`.
- **Legal:** `legal_acceptances` (documento, versão, data, IP e navegador).
- **Auth do cliente final:** `client_otp_codes` (hash do código, validade e
  tentativas) e `client_sessions` (hash do token Bearer, validade e revogação).

### 2.5 Financeiro (princípios e estado)
- **Partidas dobradas**, **append-only** (sem UPDATE/DELETE para a role do app;
  trigger bloqueando `UPDATE`), **balanceado** (constraint trigger deferido).
- **Idempotência** por `idempotency_key` (pagamentos, cobranças, etc.).
- Fluxos implementados: cobrança (D Receber / C Receita), pagamento
  (D Caixa/Banco / C Receber), comissão (D Despesa Comissão / C Comissão a Pagar),
  gorjeta (C Gorjetas a Pagar), repasse (D Comissão+Gorjeta a Pagar / C Caixa),
  carteira (D Caixa / C Carteira; pagamento com carteira), cupom (D Descontos /
  C Receber), pacote (D Caixa / C Pacotes a Resgatar; resgate D Pacotes / C Receita),
  assinatura (faturamento D Caixa/Banco / C **Receitas a Apropriar**; ao fim do
  período, reconhecimento D Receitas a Apropriar / C Receita de Assinaturas).
- **Fechamento contábil:** períodos fechados (`accounting_periods`) bloqueiam
  novos lançamentos com data dentro do intervalo (checado em `postEntry`);
  snapshot do balancete guardado no fechamento (`/closing`).
- **Gateway online:** adapter portável em `src/lib/payments/*` (mock, Mercado
  Pago e InfinitePay). Mercado Pago assina o webhook; a InfinitePay confirma o
  evento via `/payment_check` (`requiresSecret: false`).
- **Falta:** conciliação automática de extrato bancário (a atual é manual em
  `/reconciliation`), baixa automática de contas a pagar e integração do
  pagamento online no agendamento público.

### 2.6 Convenções
- Schema Drizzle em `src/db/schema` é a **fonte de verdade**; funções, triggers,
  policies e grants em `db/rls.sql`.
- **Ao mexer no schema:** `npm run db:generate` (gera a migration em `drizzle/`)
  e `npm run db:migrate` (aplica migrations + `db/rls.sql`); nunca
  `drizzle-kit push`. Fluxo completo em `docs/banco-e-ambientes.md`.
- Dinheiro sempre em centavos; sem lógica de dinheiro no client.
- Quality gate: `npx tsc --noEmit`, `npx eslint .`, `npm test`, `npm run build`.
- e2e: `npm run test:e2e` (Playwright; sobe o dev server e exige `.env.local`
  configurado e `npm run seed:demo` executado). Instale o navegador uma vez com
  `npm run test:e2e:install`.

### 2.7 Setup de desenvolvimento (onboarding do dev)
1. `npm install`
2. `.env.local` a partir de `.env.example`:
   `DATABASE_URL`, `DATABASE_AUTHENTICATED_URL`, `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL`, `APP_ENV=dev` (opcional: `RESEND_API_KEY`, `EMAIL_FROM`,
   `CRON_SECRET`, `OPENROUTER_API_KEY`, `PAYMENT_PROVIDER`,
   `BILLING_PROVIDER`).
3. Aplicar schema/RLS/seed:
   `npm run db:migrate` (migrations + `db/rls.sql`)
   → `node --env-file=.env.local scripts/apply-sql.mjs db/seed.sql`
   → **`npm run seed:demo`** (cenário demo completo: catálogo, agenda,
   financeiro com ledger balanceado, pacotes/assinatura/cupons, notificações).
4. `npm run dev`; cadastrar em `/login`; criar a empresa em `/onboarding`.
- Scripts: `scripts/migrate.mjs`, `scripts/baseline.mjs`, `scripts/apply-sql.mjs`,
  `scripts/schema-snapshot.mjs`, `scripts/check-overlaps.mjs`,
  `scripts/smoke-rls.mjs`, `scripts/smoke-ledger.mjs`, `scripts/smoke-overlap.mjs`.

### 2.8 Infra & deploy
- **Vercel** + **Neon**; **CI** (migrations em dia/lint/typecheck/test/build) no GitHub Actions.
- **Ambientes:** o site no ar é a **demo** (`APP_ENV=demo`, branch Neon
  `production`); desenvolvimento, e2e e Preview usam o branch Neon `dev`
  (`APP_ENV=dev`). O banco de produção real só será criado no lançamento.
  Detalhes em `docs/banco-e-ambientes.md`.
- **Git**: `axyonsoftwarehouse/glowhub` (branch de produção `master`), conectado ao
  projeto Vercel `glowhub` (time `torinoorbit-dev`) para deploy automático a cada push.
- **Cron** (`vercel.json`): `/api/cron/subscriptions` (diário, renova assinaturas
  vencidas) e `/api/cron/daily` (webhooks, lembretes e envio de notificações);
  ambos protegidos por `CRON_SECRET`.
- **Webhooks extras:** `/api/billing/webhooks/[provider]` (assinatura da
  plataforma; Mercado Pago Assinaturas) e `/api/webhooks/[provider]` (cobrança
  dos clientes do salão).
- **Produção:** https://glowhub-silk.vercel.app (também
  `glowhub-torinoorbit-dev.vercel.app`). Env de produção configuradas
  (`DATABASE_URL` pooled). Billing, assistente e gateway dependem das chaves
  próprias (`BILLING_MP_*`, `OPENROUTER_API_KEY`, `PAYMENT_PROVIDER`).
- **Conta demo:** botão *"Entrar com conta demo"* na tela de login. Vincula o
  usuário como **owner de 3 tenants** (`demo`, `studio-bella`, `clinica-lumina`)
  → use o seletor **Empresa**. Também vincula a um profissional de `demo`,
  habilitando a visão **Minha agenda**. Desativado por padrão: só funciona com
  `APP_ENV` `demo`/`dev`, `NEXT_PUBLIC_DEMO_LOGIN=true` **e** `DEMO_PASSWORD` definidos (validado no
  servidor, não apenas no botão); tem rate limit. Em produção está **habilitado
  para demonstrações**: qualquer visitante vira `owner` apenas dos tenants demo
  (dados de exemplo, isolados por RLS). Esses tenants são **somente leitura**
  (`is_read_only`): catálogo, financeiro, equipe e configurações recusam escrita;
  agenda, clientes e agendamento online seguem liberados.
- **Dados demo:** `npm run seed:demo` recria os 3 tenants com cenário completo e
  ledger balanceado (catálogo, agenda, financeiro, pacotes, assinatura, cupons,
  gateway mock). Idempotente (não toca em outros dados). Roda livre com
  `APP_ENV=dev`; no banco da demo exige `--confirm-demo`. Os tenants criados
  nascem somente leitura; `DEMO_READ_ONLY=false` libera escrita em dev/preview.
- **Conciliação:** `/reconciliation` casa cobrança ↔ pagamento ↔ gateway e permite
  confirmar pagamentos pendentes (efeito de webhook).
- **App mobile/EAS:** `mobile/eas.json` (perfis development/preview/production)
  e `expo-dev-client` prontos; `android.package`/`ios.bundleIdentifier` em
  `com.glowhub.app`. Falta rodar o build e validar push em aparelho físico
  (credenciais FCM/APNs e conta EAS).

---

## 3. Status atual (o que está pronto)
Rotas: `/`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email`,
`/aceite-termos`, `/termos`, `/privacidade`, `/invite/[token]`, `/onboarding`,
`/dashboard`, `/branches`, `/services`, `/products`, `/professionals`,
`/inventory`, `/schedule`, `/appointments`, `/my-schedule`, `/clients`,
`/clients/[id]`, `/packages`, `/subscriptions`, `/coupons`, `/loyalty`,
`/notifications`, `/helpers`, `/finance`, `/reconciliation`, `/reports`,
`/reports/profitability`, `/closing`, `/settings`, `/profile`, `/assistant`,
`/billing`, `/billing/mock`, `/book`, `/pay/mock`, `/api/auth/[...all]`,
`/api/webhooks/[provider]`, `/api/billing/webhooks/[provider]`,
`/api/cron/subscriptions`, `/api/cron/daily`, `/api/cron/webhooks`,
`/api/health`, `/api/metrics`, `/api/v1/*`.

- Auth/sessão, **recuperação de senha** (`/forgot-password` → `/reset-password`,
  link de 1 h) e **verificação de e-mail** (`/verify-email`, opcional por
  `AUTH_REQUIRE_EMAIL_VERIFICATION`), convites por link, **edição/remoção de
  membros**, troca de empresa, **onboarding**.
- **LGPD**: Termos (`/termos`) e Política de Privacidade (`/privacidade`), aceite
  obrigatório no cadastro e reaceite por versão (`/aceite-termos`,
  `legal_acceptances`).
- **Billing da plataforma** (`/billing`): planos Solo/Equipe/Rede, teste grátis,
  limites e bloqueio; mock e Mercado Pago Assinaturas com webhook próprio.
- Catálogo completo com overrides por filial; agenda e **disponibilidade**;
  **agendamentos** e **clientes** com **busca** e **paginação**; políticas de
  **cancelamento/no-show** por tenant (`/settings`).
- **Financeiro** completo no núcleo: ledger, cobrança, pagamentos idempotentes,
  comissão/gorjeta/repasse, carteira, cupons, pacotes, assinaturas (com
  **receita diferida**), estorno formal de cobrança, conciliação, relatórios e
  **fechamento contábil**.
- **Estoque e insumos** (ficha técnica, custo médio, CMV, movimentos
  append-only) e **fidelização** (gift cards, pontos e campanhas).
- **Agendamento online**, **verificação de e-mail**, **notificações por e-mail**
  (caixa de saída, lembretes diários) e **registro de push** (tokens Expo;
  envio real pendente de EAS/development build).
- **API v1** para app: login Bearer, tenant ativo, agenda da equipe e catálogo/
  disponibilidade/booking público (sem login).
- **Cliente final no app**: login **OTP por e-mail**, sessão Bearer de 30 dias,
  meus agendamentos e **troca de empresa** (`/api/v1/client/*`); a área do
  cliente (`mobile/src/app/client.tsx`) lista os agendamentos e permite sair.
- **Pacote mobile solo**: navegação inferior, painel “Hoje” com ações rápidas e
  checklist, modo solo (`tenants.is_solo`) e onboarding que cria profissional,
  serviço, horários e plano de contas.
- **App mobile (Expo)**: login Bearer, agenda Hoje/7 dias, pull-to-refresh,
  ações de status, **booking público em 4 passos** e **registro de push**
  (`mobile/`). O envio real de push depende de `projectId` EAS e development
  build.
- **Assistente de IA** (`/assistant`, OpenRouter): perguntas sobre o negócio,
  escrita assistida, análises, leitura de comprovantes Pix/cartão e **modo voz**
  (Web Speech API); rate limit próprio e chave só no servidor.
- **CI** + **164 testes unitários** (25 arquivos) e **16 cenários e2e** (+ setup;
  Playwright: login demo, minha agenda + status, histórico do cliente, booking,
  API v1 pública, navegação mobile, assinaturas, fechamento e **7 verificações
  de acessibilidade com axe**); `tsc`/`eslint`/`build` verdes.

---

## 4. O que falta (backlog priorizado)

### Fase 6 — Canais
- [x] **API v1** para app: login Bearer (`/api/v1/auth/login`), `/me`, troca de
      tenant, agenda (`/appointments`) e booking público
      (`/public/catalog|availability|bookings`). Contrato em
      [`api-mobile.md`](api-mobile.md).
- [x] **Web mobile solo**: navegação inferior, painel “Hoje”, modo solo e
      onboarding assistido.
- [x] **App mobile inicial (Expo)**: login Bearer, token no SecureStore, agenda
      Hoje/7 dias, ações de status, booking público e registro de push
      ([`mobile/`](../mobile/README.md)).
- [x] **Login do cliente final (OTP)**: código por e-mail, sessão Bearer de
      30 dias, meus agendamentos e troca de empresa no app.
- [ ] **App mobile completo**: rodar o build EAS (development e produção) e
      validar push em aparelho físico — `mobile/eas.json` e `expo-dev-client` já
      estão configurados.

### Financeiro / comercial
- [x] **Gateway online** (adapter portável: mock + Mercado Pago + InfinitePay),
      link de checkout na comanda, webhooks e confirmação/estorno no ledger.
- [x] **Estorno/void formal** de cobrança aberta (reverso no ledger, devolução
      de estoque, cupom e comissão) e **retry/fila de webhooks** com backoff
      (`webhook_events` + `/api/cron/webhooks`).
- [ ] **Conciliação automática** de extrato bancário (a conciliação do gateway e
      manual continua em `/reconciliation`).
- [x] **Recorrência automática de assinaturas** (`/api/cron/subscriptions`,
      cron diário na Vercel + botão manual) e **consumo/limites** por período
      (assinaturas via `subscription_redemptions`; pacotes já por quantidade).
- [x] **Fechamento** contábil: travar período (bloqueia lançamentos no intervalo)
      e snapshot do balancete (`/closing`).
- [x] **Receita diferida**: assinaturas creditam "Receitas a Apropriar" no
      faturamento e reconhecem a receita ao fim do período (renovação/cron).

### Comunicação
- [x] **Agendador diário** (`/api/cron/daily`) para lembretes de agendamento e
      envio da caixa de saída.
- [x] **Recuperação de senha** e **verificação de e-mail** (link de 24 h;
      exigência opcional), com reenvio no painel.
- [ ] **Provedor de e-mail real** (`RESEND_API_KEY` + domínio verificado) e
      **envio do convite de equipe por e-mail**.
- [x] **Registro de push** (tokens Expo por usuário/tenant).
- [ ] Envio real de **push** (projectId EAS + development build) e canais **SMS**.

### Produto
- [x] **Visão do profissional** (agenda própria `/my-schedule`, com mudança de
      status dos próprios atendimentos) e **histórico por cliente**
      (`/clients/[id]`).
- [x] **Busca** (`?q=`) e **paginação** (`?page=`) nas listas de clientes,
      serviços, produtos, profissionais (e busca na agenda).
- [x] **Edição/remoção de membros** da equipe (papel + remover; revogar convite).
- [x] Políticas de **cancelamento/no-show** por tenant (`/settings`): janela
      mínima de cancelamento e taxa de no-show lançada no ledger.
- [ ] **Storage de arquivos** (logo/imagens por tenant; hoje só URL).

### Assistente de IA
- [x] **Perguntas** (resumo da empresa via RLS + OpenRouter), **escrita
      assistida** (WhatsApp, respostas, descrições, promoções, legendas),
      **análises** (dia, semana, inativos, caixa), **leitura de comprovantes**
      Pix/cartão e **modo voz**.
- [ ] Validar custo/limites em produção e avaliar o plano de cada tenant.

### Transversal / produção
- [x] Onboarding de tenant; CI; testes unitários; e-mail (caixa de saída).
- [x] **LGPD**: Termos/Política, aceite no cadastro, histórico em
      `legal_acceptances` e reaceite por versão.
- [x] **Billing da plataforma** (`/billing`): planos, teste grátis, limites,
      bloqueio, mock + Mercado Pago Assinaturas e webhook próprio.
- [ ] Validar o billing no sandbox do Mercado Pago e confirmar preços.
- [ ] Preencher `LEGAL_COMPANY` (razão social, CNPJ, endereço, DPO) e revisar o
      texto com advogado.
- [x] **e2e** (Playwright) dos fluxos críticos: login demo, minha agenda
      (vínculo + status), histórico do cliente e booking público. Workflow
      `e2e.yml` manual (usa secrets de banco).
- [x] **Observabilidade in-app**: logger estruturado (JSON), `/api/health`
      (checa banco) e logs de webhook/rate-limit.
- [x] **Métricas e alertas externos**: `recordMetric` (`src/lib/metrics.ts`)
      emite cada métrica como log JSON (coletável por log drain) e, se
      `METRICS_WEBHOOK_URL` existir, faz POST best-effort ao coletor; scrape
      protegido em `/api/metrics` (`METRICS_TOKEN`). `sendAlert`
      (`src/lib/alerts.ts`) loga sempre e empurra alertas (`ALERT_WEBHOOK_URL`,
      compatível com Slack/Discord/Mattermost) a partir de `ALERT_MIN_LEVEL`
      (`error` por padrão), com supressão por `ALERT_COOLDOWN_SECONDS`. Pontos
      instrumentados: health, webhooks, rate-limit/auth, e-mail, erros de
      servidor e cron de assinaturas.
- [x] **Deploy na Vercel**: produção em `glowhub-silk.vercel.app`; domínio
      raiz/subdomínios customizados ainda pendentes.
- [x] **Segurança**: **rate limiting** no sign-in/sign-up do Better Auth
      (fixed-window em banco, tabela interna `rate_limits`, fail-open); revisão
      contínua de policies.
- [x] **Acessibilidade**: foco visível global, link "pular para o conteúdo",
      labels/aria em formulários, contraste AA e testes e2e com **axe**
      (`e2e/a11y.spec.ts`). Projeto **exclusivamente em pt-BR** (sem i18n).

---

## 5. Riscos e considerações
- **Produção**: verificação de e-mail implementada, mas depende de provedor real
  (Resend + domínio); faltam banco de produção dedicado, domínio próprio e
  revisão final de segurança. Observabilidade in-app + métricas/alertas externos
  prontos (falta apenas configurar coletor/webhook).
- **Financeiro**: mudanças exigem cuidado (imutável, balanceado, idempotente);
  novos lançamentos devem passar por `src/lib/ledger.ts`.
- **Gateway**: três adapters (mock, Mercado Pago e InfinitePay); provedor
  definitivo, conciliação automática de extrato e estorno de pagamento já
  confirmado ainda em aberto (o estorno de cobrança aberta está pronto).
- **Assistente**: depende de `OPENROUTER_API_KEY`; custo por uso e privacidade
  dos dados enviados ao provedor devem ser avaliados antes de produção.
- **Login do cliente (OTP)**: depende de e-mail real para produção e só funciona
  para clientes que informaram e-mail no cadastro; sem provedor (dev/demo) o
  código aparece no console/`devCode`.
- **RLS vs. canal público**: o `/book` usa a conexão admin com escopo explícito;
  manter essa disciplina ao evoluir.

---

## 6. Retomada (handoff) — como continuar em uma nova sessão

1. **Comece pela documentação**: [`como-funciona.md`](como-funciona.md) para o
   comportamento real, [`architecture.md`](architecture.md) para as decisões e
   este relatório para o backlog.
2. **Repositório**: `git clone https://github.com/axyonsoftwarehouse/glowhub`; branch `master`.
3. **Dependências**: `npm install`.
4. **Env**: criar `.env.local` a partir de `.env.example` (Neon owner + role do
   app + `BETTER_AUTH_SECRET`). Ver `docs/neon-migration.md` para o setup do Neon.
5. **Banco**: `npm run db:migrate` → `db/seed.sql` (via `scripts/apply-sql.mjs`)
   → `npm run seed:demo` (cenário demo). Ver `docs/banco-e-ambientes.md`.
6. **Qualidade**: `npx tsc --noEmit` && `npx eslint .` && `npm test` && `npm run build`.
7. **e2e** (opcional): `npm run test:e2e:install` uma vez; depois `npm run test:e2e`
   (sobe o dev server; exige `.env.local` e seed demo).
8. **Smoke**: `node --env-file=.env.local scripts/smoke-rls.mjs`, `...smoke-ledger.mjs`
   e `...smoke-overlap.mjs`.
9. **Rodar**: `npm run dev` (app em `/dashboard`; público em `/book`).

Pontos de entrada úteis:
- Multi-tenancy/RLS: `src/lib/db.ts`, `src/lib/tenant.ts`, `db/rls.sql`.
- Rate limit / logs / health: `src/lib/rate-limit.ts`, `src/lib/logger.ts`,
  `src/lib/metrics.ts`, `src/lib/alerts.ts`,
  `src/app/api/auth/[...all]/route.ts`, `src/app/api/health/route.ts`,
  `src/app/api/metrics/route.ts`.
- Auth: `src/lib/auth.ts`, `src/lib/session.ts`, `src/app/api/auth/[...all]/route.ts`.
- Auth/e-mail (recuperação, verificação): `src/lib/auth-emails.ts`,
  `src/lib/email.ts`, `src/app/(auth)/forgot-password|reset-password|verify-email/*`.
- Cliente final (OTP): `src/lib/client-auth.ts`, `src/lib/client-auth-tokens.ts`,
  `src/app/api/v1/client/*`, `mobile/src/app/client.tsx`.
- LGPD: `src/lib/legal.ts`, `src/app/(legal)/termos|privacidade/*`,
  `src/app/(auth)/aceite-termos/*`.
- Billing da plataforma: `src/lib/billing/*` (planos, acesso, provedores,
  serviço), `src/app/(billing)/billing/*`,
  `src/app/api/billing/webhooks/[provider]/route.ts`.
- Assistente de IA: `src/lib/assistant.ts`, `src/app/(app)/assistant/*`
  (perguntas, escrita, análises, comprovantes e voz).
- Financeiro: `src/lib/ledger.ts`, `src/app/(app)/finance/*`.
- Fechamento contábil: `src/lib/accounting.ts`, `src/app/(app)/closing/*`,
  `src/db/schema/accounting.ts` (bloqueio em `postEntry`).
- Estoque e insumos: `src/lib/inventory.ts`, `src/app/(app)/inventory/*`,
  ficha técnica em `src/app/(app)/services/service-materials.tsx`.
- Disponibilidade: `src/lib/availability.ts`, `src/lib/availability-data.ts`.
- Booking público: `src/app/book/*`.
- Visão do profissional: `src/app/(app)/my-schedule/*` + vínculo em
  `src/app/(app)/professionals/*` (`professionals.user_id`).
- Histórico do cliente: `src/app/(app)/clients/[id]/page.tsx`.
- CRM de clientes: `src/lib/crm.ts`, `src/app/(app)/clients/*`
  (segmentos, VIP, ticket, frequência, LTV, aniversário/tags/preferências).
- Lucratividade & DRE: `src/lib/profitability.ts`,
  `src/app/(app)/reports/profitability/*`, `src/lib/accounting.ts`
  (`computeTrialBalance`, agora com `systemKey`).
- Fidelização: `src/lib/loyalty.ts`, `src/app/(app)/loyalty/*`
  (gift cards, pontos, campanhas; contas `liability_gift_card`,
  `revenue_gift_card`, `expense_loyalty`).
- Pagamento online: `src/lib/payments/*` (adapters mock, Mercado Pago e
  InfinitePay; `confirmPendingPayment`), `/api/webhooks/[provider]`, `/pay/mock`,
  botão "Cobrar online" em `src/app/(app)/finance/*`.
- e2e: `e2e/*.spec.ts`, `e2e/auth.setup.ts`, `playwright.config.ts`.

Decisões em aberto (ver `docs/architecture.md`): canais **push/SMS** com envio
real, **storage** de arquivos, **conciliação automática** de extrato e provedor
definitivo de gateway.

## 7. Glossário
- **Tenant**: empresa cliente do SaaS. **Branch**: filial.
- **Membership**: vínculo usuário↔tenant com papel.
- **Charge (cobrança)**: valor a receber por um atendimento.
- **Ledger**: livro-razão de partidas dobradas (imutável).
- **RLS**: Row Level Security (isolamento por linha no Postgres).
- **Billing da plataforma**: assinatura que o salão paga ao GlowHub
  (`platform_subscriptions`/`platform_payments`; não confundir com as
  assinaturas vendidas aos clientes do salão).
- **Assistente**: camada de IA em `/assistant` (OpenRouter) que só lê um resumo
  via RLS e nunca grava dados sozinha.
- **OTP**: código de uso único enviado por e-mail para o cliente final entrar no
  app; o servidor guarda só o hash, com validade e limite de tentativas.
