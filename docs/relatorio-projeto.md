# GlowHub — Escopo e Status do Projeto

> Documento de referência para o time de desenvolvimento. Une a **visão de
> negócio** e a **visão técnica** num só lugar: o que o produto é, para quem,
> como está construído e o que falta.

- Repositório: privado
- Estágio: **MVP interno funcional** (fundação + Fases 1–3 completas; Fase 4
  iniciada). Ainda **não pronto para produção** (ver riscos e backlog).
- Última atualização: alinhada ao estado atual do código.

---

## 1. Visão de negócio

### 1.1 Problema e oportunidade
Salões, barbearias, clínicas de estética e spas operam hoje com uma mistura de
agenda em papel/planilha, WhatsApp e sistemas genéricos que **não conversam com o
financeiro**. Isso gera: overbooking, no-show, preços inconsistentes entre
filiais, comissões calculadas na mão e falta de visão de caixa.

O GlowHub ataca isso como um **SaaS multi-tenant** de agendamento + gestão, com
um **financeiro contábil de verdade** (partidas dobradas) como diferencial.

### 1.2 Público-alvo
Negócios de agendamento com profissionais e venda de produtos: salões, barbearias,
estúdios unissex, clínicas de estética, spas, nail design, sobrancelhas/cílios e
massagem. Do **autônomo com 1 cadeira** à **rede com várias filiais**.

### 1.3 Proposta de valor
- Agenda e disponibilidade por **profissional e filial**, com bloqueios.
- Catálogo de **serviços e produtos** com preço/duração por filial.
- **Financeiro auditável** (livro imutável, centavos, idempotência) — não um
  relatório solto.
- **Multi-tenant** seguro por padrão (isolamento por RLS no banco).

### 1.4 Modelo de negócio (hipóteses)
- **Assinatura por tenant** (SaaS), com planos por nº de filiais/profissionais e
  usuários. (Planos/assinaturas ainda **não implementados**.)
- Receita adicional possível: taxas sobre pagamentos online (a definir gateway).
- Múltiplos **tenants** no mesmo banco, isolados por `tenant_id` + RLS.

### 1.5 Personas e papéis
Papéis por tenant: **owner, admin, manager, staff, viewer**.

| Persona | O que faz no sistema |
|---|---|
| Dono (owner) | Configura empresa, preços, equipe, vê financeiro e relatórios. |
| Gerente (manager) | Opera filiais, catálogo, agenda e equipe. |
| Recepção / staff | Agenda, check-in/checkout, cobrança, clientes. |
| Profissional | (Vê sua agenda — visão "profissional" ainda **não** é dedicada.) |
| Cliente final | Ainda **sem canal próprio** (site/app a construir). |

### 1.6 Escopo funcional (módulos)

| Módulo | Descrição de negócio | Status |
|---|---|---|
| Fundação & Tenancy | Empresas, filiais, vínculos e papéis | ✅ |
| Autenticação | Login/cadastro, sessão, logout, aceite de convite | ✅ (verificação de e-mail pendente) |
| Equipe & Convites | Convidar por link, papéis, troca de empresa ativa | ✅ (envio de e-mail pendente) |
| Filiais | Criar/editar/ativar-desativar unidades | ✅ |
| Catálogo | Categorias, serviços, produtos (variações/estoque), profissionais | ✅ |
| Preços por filial | Override de preço/duração e disponibilidade por unidade | ✅ |
| Agenda | Horários, intervalos, feriados e cálculo de disponibilidade | ✅ |
| Agendamentos | Reserva com status (pendente→confirmado→check-in→checkout→concluído) | ✅ |
| Clientes | Cadastro e histórico via agenda | ✅ (página de histórico dedicada pendente) |
| Financeiro | Plano de contas + ledger de partidas dobradas + cobrança | 🟡 (núcleo pronto; pagamentos/relatórios pendentes) |
| Pacotes/Assinaturas | Pré-pago e recorrência | ⛔ |
| Cupons/Promoções | Descontos com regras | ⛔ |
| Notificações | E-mail/push e lembretes | ⛔ |
| Canal cliente | Site público/agendamento online e app mobile | ⛔ |
| Relatórios | Faturamento, ocupação, comissões, fechamento | ⛔ |

Legenda: ✅ pronto · 🟡 parcial · ⛔ não iniciado.

### 1.7 Jornadas (estado atual)
- **Dono/gerente:** cria filial → cadastra categorias/serviços/produtos →
  profissionais e vínculos → horários/bloqueios → agenda e cobra.
- **Recepção:** abre a Agenda do dia → cria agendamento (busca de slots) →
  check-in/checkout → **Cobrar** → **Receber**.
- **Cliente final:** ainda **não** tem autoatendimento (depende da Fase 6).

---

## 2. Escopo técnico

### 2.1 Stack
- **Next.js 16** (App Router, Turbopack, Server Actions) + **React 19** +
  **TypeScript** na **Vercel**.
- **Neon (Postgres)** como banco; **Row Level Security (RLS)** como camada de
  isolamento.
- **Better Auth self-hosted** (tabelas `user`/`session`/`account`/`verification`
  no próprio banco) — escolhido por **portabilidade** (troca de Postgres não afeta
  a auth).
- **Drizzle ORM** para schema e queries (server-side). **Zod** para validação.
- **Tailwind v4** para UI.

### 2.2 Arquitetura (visão geral)
```
Browser ──► Next (RSC + Server Actions)
              │  Better Auth (app/api/auth/[...all])
              │
              ├─ getDb()            → role owner  (auth, migrations/admin, ignora RLS)
              └─ withUser(userId, cb) → role app   (queries do usuário, RLS aplicada)
                                          │
                                Neon Postgres (RLS + ledger)
```
- O app é **100% server-side** para dados; não há acesso direto do browser ao
  banco.
- `src/proxy.ts` resolve o **tenant por subdomínio** (`<slug>.dominio`, e
  `DEFAULT_TENANT_SLUG`/`?tenant=` em dev) e injeta o header de tenant.

### 2.3 Multi-tenancy e segurança
- **Modelo:** schema compartilhado + `tenant_id` em todas as tabelas de domínio +
  **RLS**.
- **Identidade no banco:** a role do app (`glowhub_app`, **sem `BYPASSRLS`**)
  recebe, por transação, `set_config('request.jwt.claims', '{"sub": <userId>}')`.
  As policies usam `public.auth_uid()` (e helpers `is_tenant_member`,
  `has_tenant_role`).
- **Tenant ativo** do usuário fica em `profiles.active_tenant_id` (troca = UPDATE;
  sem refresh de token).
- **Admin** (`DATABASE_URL`, owner) ignora RLS — usado só por auth/migrations.
- **RLS por papel:** leitura por membros; escrita por papel (catálogo:
  `owner/admin/manager`; agenda/clientes/cobranças: também `staff`).
- **Convites:** token por link; aceite via função `SECURITY DEFINER`
  (`accept_invitation`) porque o convidado ainda não é membro.

### 2.4 Modelo de dados (tabelas por domínio)
- **Auth:** `user`, `session`, `account`, `verification`.
- **Tenancy:** `tenants`, `branches`, `memberships`, `invitations`, `profiles`.
- **Catálogo:** `categories` (kind service/product, hierarquia), `services`,
  `service_branches` (override), `professionals`, `professional_branches`,
  `professional_services`.
- **Produtos:** `products`, `product_variants` (preço, SKU, estoque).
- **Agenda:** `branch_hours`, `professional_hours`, `branch_closures`.
- **Atendimento:** `clients`, `appointments` (status enum + trava de sobreposição
  por profissional via *exclusion constraint* `btree_gist`).
- **Financeiro:** `ledger_accounts`, `journal_entries`, `journal_lines`,
  `charges`, `charge_items`.
- Dinheiro sempre em **centavos** (`bigint`). Conversão em `src/lib/money.ts`.

### 2.5 Financeiro (princípios e estado)
- **Partidas dobradas**, **livro append-only** (sem UPDATE/DELETE para a role do
  app; há trigger bloqueando `UPDATE`), **balanceado** (constraint trigger deferido
  valida débitos = créditos no commit).
- **Idempotência** por `idempotency_key` única por tenant (ex.:
  `charge-revenue-<id>`, `charge-settle-<id>`).
- **Cobrança** do atendimento: gera **Débito Contas a Receber / Crédito Receita**.
  **Recebimento** (manual, dinheiro): **Débito Caixa / Crédito Contas a Receber**.
- Contas de sistema resolvidas por `ledger_accounts.system_key`
  (`cash`, `bank`, `accounts_receivable`, `revenue_service/product/package`).
- **Ainda não há:** gateway de pagamento, webhooks, conciliação, estorno/void
  (existe estrutura `reverses_entry_id`), gorjeta/comissão/repasse, carteira,
  relatórios e fechamento.

### 2.6 Convenções de código
- Schema Drizzle em `src/db/schema` é a **fonte de verdade** das tabelas; funções,
  triggers, policies e grants ficam em `db/rls.sql`.
- **Ordem ao mexer no schema:** `npx drizzle-kit push` **e depois** aplicar
  `db/rls.sql` (o push pode recriar tabelas e derrubar RLS).
- Nada de lógica de dinheiro no client; tudo em centavos.
- Server Actions validam com Zod; erros de RLS/constraint são tratados por código
  (`23505`, `42501`, `23P01`).
- `npx tsc --noEmit`, `npx eslint .` e `npm run build` devem passar sempre.

### 2.7 Setup de desenvolvimento (onboarding)
1. `npm install`
2. Criar `.env.local` a partir de `.env.example` com:
   `DATABASE_URL`, `DATABASE_AUTHENTICATED_URL`, `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL`.
3. Criar a role do app no Neon e aplicar:
   `npx drizzle-kit push` → `node --env-file=.env.local scripts/apply-sql.mjs db/rls.sql`
   → `... db/seed.sql`.
4. `npm run dev` e cadastrar em `/login`; vincular `membership` do tenant demo.
- Scripts auxiliares: `scripts/apply-sql.mjs`, `scripts/smoke-rls.mjs`,
  `scripts/smoke-ledger.mjs`.

### 2.8 Infra & deploy
- **Vercel** (previsto) + **Neon** (banco). Vercel ainda **não configurado** no
  repo (sem CI/CD). Runbook em `docs/neon-migration.md`.

---

## 3. Status atual (o que está pronto)

Rotas implementadas:
`/` (landing), `/login`, `/invite/[token]`, `/dashboard`, `/branches`,
`/services`, `/products`, `/professionals`, `/schedule`, `/appointments`,
`/clients`, `/team`, `/profile`, `/finance`, `/api/auth/[...all]`.

- **Auth e sessão** funcionando (Better Auth), com convites por link e troca de
  empresa ativa.
- **Catálogo completo** com overrides por filial e vínculos de profissionais.
- **Agenda** com disponibilidade calculada (`src/lib/availability.ts`) e
  **agendamentos** com fluxo de status.
- **Clientes** cadastráveis; **financeiro** com ledger e cobrança do atendimento.
- **Qualidade:** `tsc`, `eslint` e `build` verdes; smoke tests de RLS e do ledger
  passando.

---

## 4. O que falta (backlog priorizado)

### Fase 4 — Financeiro (continuação) — **prioridade alta**
- [ ] **Pagamentos idempotentes** com gateway + **webhooks** + **conciliação**
      (substituir o "Receber" manual). Registrar `event_id` do provedor.
- [ ] **Estorno/cancelamento** como lançamento reverso (usar `reverses_entry_id`).
- [ ] **Gorjeta, comissão e repasses**; estado pendente/pago; **carteira** do
      cliente (crédito pré-pago).
- [ ] **Relatórios e fechamento** (faturamento, ocupação, comissões, DRE simples).

### Fase 5 — Recorrência & comercial — **prioridade média**
- [ ] **Pacotes** (pré-pago) e **assinaturas** (planos recorrentes/limites).
- [ ] **Cupons/promoções** (percentual/fixo, validade, limite de uso).
- [ ] **Notificações** (e-mail/push) e **lembretes** de agendamento.

### Fase 6 — Canais — **prioridade média/baixa**
- [ ] **Website público / agendamento online** (cliente final).
- [ ] **App mobile** do cliente.

### Transversal — **prioridade alta conforme o time**
- [ ] **Testes automatizados** (unit + e2e dos fluxos críticos). Hoje só há
      smoke scripts.
- [ ] **Observabilidade**: logs, métricas e **alertas de pagamento**.
- [ ] **Segurança**: revisão de policies de RLS, **rate limiting** e proteção de
      rotas do Better Auth.
- [ ] **CI/CD** (lint + typecheck + build em PR) e deploy na Vercel.
- [ ] **Provedor de e-mail** (verificação de conta + convites + lembretes).
- [ ] **Storage de arquivos** (avatar/logo/imagens por tenant; hoje só URL).

### Lacunas funcionais relevantes
- [ ] **Onboarding de novo tenant**: hoje o cadastro **não cria empresa**; não há
      fluxo de "criar minha empresa" (tenants são criados por seed/SQL).
- [ ] **Visão do profissional** (agenda própria) e **histórico por cliente**.
- [ ] **Multi-filial por profissional** já é modelado, mas a UI de agenda não
      filtra por profissional de forma dedicada.
- [ ] **Paginação/busca** nas listas (clientes, catálogo, agenda).
- [ ] **Cancelamento/no-show**: políticas e taxas configuráveis por tenant.
- [ ] **Edição/remoção de membros** da equipe (hoje só convite/papéis via SQL).

### Dívidas técnicas / pontos de atenção
- Sem testes automatizados; sem pipeline de CI.
- Erros de banco vazam mensagens cruas em alguns pontos (padronizar).
- `professionals.user_id` existe, mas **não** liga profissional a usuário ainda.
- `drizzle.config.ts` aponta `out: ./drizzle` (não usamos generate; usamos push).
- Better Auth `1.7.7` vs CLI `@better-auth/cli` `1.4.21` (verificar compatibilidade
  antes de depender do CLI para migrações).
- Dependência `postgres` usada apenas por scripts (não no runtime).
- Sem log de auditoria (quem fez o quê) além de `created_by` disperso.

---

## 5. Riscos e considerações
- **Produção**: o app precisa de e-mail, CI/CD, observabilidade e revisão de
  segurança antes de ir ao ar.
- **Financeiro**: qualquer mudança no ledger exige cuidado redobrado (imutável,
  balanceado, idempotente). Novos lançamentos devem passar por `src/lib/ledger.ts`.
- **Gateways**: a escolha (Stripe/Connect, Pagar.me, Mercado Pago...) e o desenho
  dos webhooks são decisões em aberto (`docs/architecture.md`).
- **Tenant onboarding**: sem "self-service", a aquisição de clientes depende de
  provisionamento manual — bloqueador comercial.

---

## 6. Próximos passos sugeridos
1. **Fechar a Fase 4**: gateway + webhooks idempotentes + conciliação; depois
   gorjeta/comissão/repasse e relatórios.
2. **Onboarding de tenant** (criar empresa no cadastro) — destrava uso real.
3. **Qualidade**: CI (lint/typecheck/build) + primeiros testes (availability,
   ledger, fluxo de agendamento).
4. **E-mail + deploy** (Vercel) para ambiente de homologação.

## 7. Glossário rápido
- **Tenant**: empresa cliente do SaaS (isolamento de dados).
- **Branch**: filial/unidade.
- **Membership**: vínculo usuário↔tenant com papel.
- **Charge (cobrança)**: registro de valor a receber por um atendimento.
- **Ledger**: livro-razão de partidas dobradas (imutável).
- **RLS**: Row Level Security (isolamento por linha no Postgres).
