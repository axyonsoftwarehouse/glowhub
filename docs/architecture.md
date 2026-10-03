# Arquitetura e decisões

## Stack
- **Next.js 16** (App Router, Turbopack) + **TypeScript** na **Vercel**.
- **Neon** (Postgres). **Better Auth self-hosted** dentro do Next (portável).
- **Tailwind v4** para UI; **Drizzle** para schema/queries server-side; **Zod** para validação.

Por que não separar um backend agora: o Postgres + Better Auth suprem auth/dados e
a **RLS** é a camada de isolamento. Um serviço dedicado só quando houver necessidade
real (filas/pesado, ledger complexo, API única para o app mobile).

## Multi-tenancy (decisão central)
- **Modelo**: schema compartilhado + `tenant_id` em todas as tabelas + **RLS**.
- **Contexto de identidade**: o app conecta com a role `glowhub_app` (sem
  `BYPASSRLS`) e, por transação, injeta `request.jwt.claims = {"sub": userId}` via
  `set_config`; as policies usam `public.auth_uid()`.
- **Resolução de tenant**: por **subdomínio** (`<slug>.dominio`) no `src/proxy.ts`;
  fallback `DEFAULT_TENANT_SLUG`/`?tenant=` em dev.
- **Troca de tenant ativa**: o tenant ativo fica em `profiles.active_tenant_id`
  (troca = UPDATE; sem refresh de token). `getCurrentTenant` prioriza esse valor e
  cai para o primeiro vínculo do usuário.
- **Hierarquia**: `tenant` (empresa) → `branches` (filiais) → `memberships`
  (usuário + papel + filial padrão).
- **Papéis**: `owner`, `admin`, `manager`, `staff`, `viewer`.

### Como acessar dados
| Caminho | Quando usar | RLS |
|---|---|---|
| `withUser(userId, cb)` (role app) | Leituras/escritas do usuário | **Sim** (aplica) |
| Drizzle `getDb()` (owner) | Auth (Better Auth), migrations/admin | **Não** — filtrar por `tenant_id` |

## Catálogo (decisões de modelo)
- **Categorias** em uma única tabela `categories`, com `kind` (`service`/`product`)
  e hierarquia via `parent_id` (categoria/subcategoria). Nome único por nível
  (`lower(name)`), por tenant e tipo.
- **Serviços** (`services`): `duration_minutes` (inteiro, > 0) e `price_cents`
  (**bigint**, centavos) como valores padrão do catálogo, além de descrição e
  imagem. Vínculo opcional a uma categoria (`on delete set null`).
- **Override por filial**: um serviço é oferecido em todas as filiais por padrão
  (valores base). A tabela `service_branches` (única por `service_id`+`branch_id`)
  guarda exceções de `price_cents`/`duration_minutes` (nullable = usa o padrão) e
  `is_active` (indisponível naquela filial). Linha sem override e ativa é
  removida para manter a tabela enxuta.
- **Profissionais** (`professionals`): pertencem ao tenant e podem (no futuro)
  apontar para um `user_id`. Os vínculos são **binários M:N**:
  `professional_branches` e `professional_services`. A disponibilidade
  "serviço ↔ profissional ↔ filial" é a **interseção** dos dois vínculos — evita
  uma tabela ternária e mantém a agenda derivável.
- **Produtos** (`products`) com **variações** (`product_variants`): preço
  (`price_cents`, bigint), `sku` e `stock_quantity` vivem na variação. Todo
  produto tem ao menos uma variação (a ação de criação garante isso). Estoque é
  básico (quantidade); movimentos de estoque ficam para o financeiro.
- Dinheiro sempre em **centavos**; a conversão de/para texto fica em
  `src/lib/money.ts` (nunca float em repouso).

## Agenda (decisões de modelo)
- **Horários semanais recorrentes**: `branch_hours` e `professional_hours`
  (weekday + intervalos `start_time`/`end_time`, com vários intervalos por dia
  para pausas). Sem linhas para o profissional, ele **herda** a filial.
- **Bloqueios**: `branch_closures` cobre feriados/folgas/manutenção por faixa de
  datas, dia inteiro ou intervalo.
- **Disponibilidade**: função pura `src/lib/availability.ts` (wall-clock, sem
  fuso/DST) — cruza filial ∩ profissional, subtrai bloqueios e compromissos e
  gera slots por passo de tempo (`stepMinutes`). O parâmetro `busy` será
  alimentado pelos agendamentos.

## Clientes e agendamentos
- **Clientes** (`clients`): nome, e-mail/telefone e observações; e-mail único por
  tenant quando informado.
- **Agendamentos** (`appointments`): cliente + serviço + profissional + filial em
  um intervalo (`starts_at`/`ends_at` em **timestamptz**), status (enum
  `pending → confirmed → check_in → checkout → completed`, com `cancelled` e
  `no_show`) e `price_cents` como *snapshot* (preço do serviço já com override da
  filial). Conversão wall-clock ↔ UTC em `src/lib/timezone.ts`.
- **Sem sobreposição**: *exclusion constraint* (btree_gist) por profissional em
  `tstzrange(starts_at, ends_at)`, ignorando cancelados.
- O formulário busca disponibilidade (slots) e o servidor revalida o horário
  antes de inserir.

## Ledger (núcleo implementado)
- **`ledger_accounts`** (plano de contas): `code` único por tenant, `name`, `type`
  (`asset/liability/equity/revenue/expense`) e hierarquia opcional (`parent_id`).
- **`journal_entries`**: evento com `occurred_at`, descrição, referência opcional
  e **`idempotency_key`** única por tenant. **`journal_lines`**: partidas com
  `direction` (debit/credit) e `amount_cents` (bigint > 0).
- **Append-only**: a role do app não pode `UPDATE`/`DELETE` (grants revogados) e há
  trigger bloqueando `UPDATE`. Correção = lançamento reverso.
- **Balanceado**: *constraint trigger* deferido (`assert_entry_balanced`) garante
  débitos = créditos por lançamento no commit.
- Saldos são derivados das partidas (sem coluna de saldo).
- **Cobranças** (`charges` + `charge_items`): um atendimento gera uma cobrança
  (uma por `appointment`, idempotente) com itens (`kind`: service/product/package).
  Ao criar, lança **débito em Contas a Receber** e **crédito em Receita**
  (contas resolvidas por `ledger_accounts.system_key`). Receber = débito em Caixa
  e crédito em Contas a Receber, marcando `paid`. Cada lançamento guarda
  `idempotency_key` (`charge-revenue-<id>`, `payment-<id>`).
- **Pagamentos** (`payments`): idempotentes (`idempotency_key`), com `method`
  (cash/debit/credit/pix/transfer/wallet/other), `status`
  (pending/confirmed/failed/refunded) e vínculo ao lançamento. O pagamento manual
  confirma na hora (**D Caixa/Banco, C Contas a Receber**) e a cobrança vira
  `paid` quando o total confirmado cobre o valor; **suporta parciais**.
- **Comissão/gorjeta/repasses**: `professionals.commission_bp` (0–10000) define a
  comissão; ao cobrar, acumula em `earnings` (kind commission) com lançamento
  **D Comissões (despesa) / C Comissões a Pagar**. Gorjeta, no pagamento, vira
  `earnings` (kind tip) com **C Gorjetas a Pagar**. O **repasse** (`payouts`) zera
  as obrigações: **D Comissões a Pagar + D Gorjetas a Pagar / C Caixa|Banco**, e
  marca os `earnings` como `paid`.
- **Carteira** (`wallet_transactions`): crédito pré-pago do cliente. Recarga =
  **D Caixa/Banco, C Carteira** (passivo); pagamento com `method = wallet` =
  **D Carteira, C Contas a Receber** (com verificação de saldo). Saldo derivado
  das transações (positivo = crédito, negativo = uso).
- **Relatórios** (`/reports`): balancete do período por conta, resultado
  (receitas − despesas), recebimentos e comissões/gorjetas por profissional.
- **Webhooks** (`webhook_events`): eventos do provedor gravados de forma
  idempotente (`provider` + `event_id`); endpoint `/api/webhooks/<provider>` já
  existe e falta a confirmação por provedor (com validação de assinatura).
  `webhook_events` é interno (sem acesso pela role do app).

## Princípios do financeiro (contábil)
1. **Livro-razão de partidas dobradas** (`ledger_accounts`, `journal_entries`,
   `journal_lines`) — **append-only**, nunca editar/apagar.
2. **Valores em centavos** (`bigint`), nunca `float`.
3. **Idempotência**: toda operação de pagamento tem uma `idempotency_key`
   única; webhooks registram o `event_id` do provedor.
4. **Saldos derivados** dos lançamentos; atualização **transacional**.
5. **Estorno** = lançamento reverso; **conciliação** = casar cobrança↔recebimento.
6. **Auditoria**: `created_by`, timestamps, e log de alterações sensíveis.

> O módulo financeiro é construído **por último**, sobre um núcleo de dados
> estável. Até lá, nada de gravar dinheiro em `float` ou fora do ledger.

## Resiliência / job assíncrono (quando necessário)
- **pg_cron**/**Edge Functions** para rotinas simples (expiração, lembretes).
- **Inngest/QStash** para fluxos duráveis (dunning de assinatura, reconciliação).

## Convenções
- Toda tabela de domínio: `tenant_id` + RLS + índices.
- O schema Drizzle (`src/db/schema`) é a **fonte de verdade** das tabelas;
  `db/rls.sql` traz funções, triggers, policies, a *exclusion constraint* e grants.
- Nada de lógica de dinheiro no client.

## Convites de equipe (decisão tomada)
- **Token por link**: o admin gera um `token` (único, expira em 7 dias) em
  `invitations`; o link `/invite/<token>` é compartilhado manualmente (envio de
  e-mail por provedor fica para depois).
- **Aceite**: o convidado autentica e chama a função `SECURITY DEFINER`
  `public.accept_invitation(token)`, que valida expiração e correspondência de
  e-mail, faz *upsert* em `memberships` (o convidado ainda não é membro, então a
  RLS o bloquearia) e remove o convite. Em seguida o tenant aceito vira o
  `active_tenant_id`.

## Decisões em aberto (roadmap de ADRs)
- Provedor de e-mail para convites/lembretes.
- Provedor de pagamento e **desenho dos webhooks** (Stripe/Connect?).
- Isolamento de **arquivos** (Storage buckets por tenant).
