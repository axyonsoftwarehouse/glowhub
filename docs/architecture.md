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
  (`price_cents`, bigint), `sku`, `unit`, custo (`cost_cents`) e estoque
  (`stock_quantity`/`min_stock`) vivem na variação. Todo produto tem ao menos uma
  variação (a ação de criação garante isso). Movimentos, ficha técnica e CMV em
  **Estoque e insumos** (abaixo).
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
  A **comanda** aceita adicionar/remover **produtos** enquanto aberta: cada item
  gera receita própria (`charge-item-revenue-<item>`, conta `revenue_product`) e a
  baixa de estoque na inclusão; a remoção estorna a receita e devolve o estoque
  (ver **Estoque e insumos**). Não é possível remover item já pago.
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
- **Pacotes** (`packages`/`package_items` templates; `client_packages` vendidos;
  `package_redemptions`). Venda = **D Caixa/Banco, C Pacotes a Resgatar**
  (passivo); resgate = **D Pacotes a Resgatar, C Receita de Serviços**. Validade
  opcional em `expires_at`; saldo por serviço derivado dos resgates.
- **Assinaturas** (`subscription_plans`/`plan_items` + `client_subscriptions`):
  planos recorrentes (mês/ano). Assinar/renovar emite cobrança com lançamento
  **D Caixa/Banco, C Receita de Assinaturas** (4.4) e avança o período; cancelar
  encerra sem nova cobrança. Benefícios/limites por período estão modelados
  (`plan_items`); o consumo por período ainda não é controlado.
- **Cupons** (`coupons` + `coupon_redemptions`): desconto percentual (basis points)
  ou fixo, com validade, mínimo e limite de usos. Aplicado a uma **cobrança aberta**:
  reduz `charges.total_cents` e lança **D Descontos e Estornos (despesa) /
  C Contas a Receber**, registrando o resgate.
- **Relatórios** (`/reports`): balancete do período por conta, resultado
  (receitas − despesas), recebimentos e comissões/gorjetas por profissional.
  **Lucratividade & DRE** (`/reports/profitability`, `src/lib/profitability.ts`):
  DRE (bruta → deduções → CMV → líquida), **margem por serviço/produto** (custo
  vem dos movimentos de estoque por item) com ranking lucro/prejuízo, e **fluxo
  de caixa** realizado (débitos/créditos em Caixa/Banco) vs. competência.
- **Webhooks** (`webhook_events`): eventos do provedor gravados de forma
  idempotente (`provider` + `event_id`); o endpoint `/api/webhooks/<provider>`
  valida a assinatura e, havendo adapter do provedor, despacha a confirmação/
  estorno no ledger. `webhook_events` é interno (sem acesso pela role do app).

## Estoque e insumos
- **Produtos** têm `kind` (`resale` | `internal`): insumos internos não são
  vendidos, só consumidos por serviços via **ficha técnica**.
- **Variações** guardam `unit` (un/ml/g), `price_cents`, `cost_cents` e
  `min_stock`. Quantidades são **inteiras na unidade-base** (ex.: 30 ml). O saldo
  `stock_quantity` **pode ficar negativo** — a baixa automática nunca bloqueia a
  comanda (estoque impreciso é corrigido por ajuste).
- **`stock_movements`** é *append-only* (auditoria): `purchase`, `sale`,
  `service_consumption`, `adjustment`, `loss`, `opening`, com `quantity_delta`
  assinado, `unit_cost_cents`, fornecedor e referência. Baixas usam chave
  idempotente por (cobrança, variação, tipo).
- **`service_materials`** define os insumos consumidos por serviço.
- **`suppliers`** + entrada de estoque (`recordPurchase`): atualiza saldo, o
  **custo médio ponderado** e lança **D Estoque / C Caixa|Contas a Pagar**.
- **Baixa por item** (`consumeChargeItem`; a criação percorre os itens via
  `consumeForCharge`): itens de produto baixam a própria variação; itens de
  serviço baixam a ficha técnica; lança **D CMV / C Estoque** por item
  (idempotente, conta `expense_cogs`). A remoção de um produto devolve o estoque e
  estorna o CMV (`restoreChargeProduct`, movimento `sale_return`). A reposição é
  sinalizada por `listLowStock` e pela tela `/inventory`.

## Pagamento online (gateway)
- **Adapter portável** (`src/lib/payments/*`): interface `PaymentProviderAdapter`
  (`createCheckout`, `verifyWebhook`, `parseWebhook`). Provedores: `mock`
  (padrão, para dev/testes — link local `/pay/mock`) e `mercadopago`
  (Checkout Pro). Ativo via `PAYMENT_PROVIDER`.
- **Link de checkout**: na comanda aberta, "Cobrar online" cria uma preferência
  no provedor, registra um `payment` **pendente** (`provider` + `provider_ref`)
  e devolve o link (`init_point`).
- **Webhook** (`/api/webhooks/<provider>`): assinatura verificada por provedor
  (Mercado Pago usa `x-signature`/`x-request-id`); o evento é gravado
  idempotente e despachado (`processPaymentWebhook`) para **confirmar**
  (D Caixa/Banco, C Contas a Receber) ou **estornar** (D Contas a Receber,
  C Caixa/Banco) via `confirmPendingPayment` — a mesma lógica usada na
  conciliação manual. Sem segredo configurado, o endpoint rejeita (safe default).

## Canal público (agendamento online)
- `/book` resolve o tenant por **subdomínio/slug** (`getCurrentTenant`) e deixa o
  visitante escolher serviço → profissional → filial/data → horário → contato.
- A disponibilidade reutiliza `src/lib/availability-data.ts` (extraído da agenda).
- Como não há sessão, as leituras/gravações públicas usam a conexão **admin**
  (`getDb`) com **escopo explícito por `tenant_id`** — decisão consciente para o
  canal público. A reserva cria/associa o cliente e insere o agendamento
  (`pending`); a *exclusion constraint* de sobreposição continua valendo.
- `pending` cai no painel para confirmação/check-in. Integração com pagamento
  online fica para a fase de gateway.

## Notificações
- **Caixa de saída** (`notifications`): canal (`email/sms/push`), destinatário,
  assunto, corpo e `status` (pending/sent/failed). É **enfileirada** (ex.: e-mail
  de confirmação no agendamento online) e processada por
  `processNotificationsAction` (drena pendentes e marca enviado/falhou).
- **Adapter portável** `src/lib/email.ts`: usa **Resend** se `RESEND_API_KEY`
  existir, senão apenas registra no console (dev). Trocar de provedor = ajustar
  só essa função. Falta um **agendador** (pg_cron/Inngest) para lembretes no
  horário certo e canais push/SMS.

## Observabilidade (in-app + externa)
- **Logger** estruturado em JSON (`src/lib/logger.ts`); a saída vai para
  stdout/stderr e é coletável por log drains.
- **Métricas** (`src/lib/metrics.ts`): `recordMetric(name, value, tags)` acumula
  contadores em memória e **sempre** emite um log JSON (`message: "metric"`). Se
  `METRICS_WEBHOOK_URL` existir, envia um POST **best-effort** (fire-and-forget,
  com timeout) ao coletor. `GET /api/metrics` faz o *scrape* dos contadores da
  instância, protegido por `METRICS_TOKEN` (Bearer; sem token → 404).
- **Alertas** (`src/lib/alerts.ts`): `sendAlert` sempre loga e, se
  `ALERT_WEBHOOK_URL` existir, empurra um payload compatível com
  Slack/Discord/Mattermost a partir de `ALERT_MIN_LEVEL` (padrão `error`),
  suprimindo títulos repetidos por `ALERT_COOLDOWN_SECONDS` (padrão 300s).
- **Health** (`/api/health`) checa o banco; instrumentado com métricas/alertas.
- Nota serverless: contadores em memória são **por instância**; séries
  históricas vêm do log drain / coletor HTTP.

## Fidelização
- **Gift cards** (`gift_cards` + `gift_card_redemptions`): valor fixo e código
  único por tenant. A venda lança **D Caixa / C Gift Cards a Resgatar** (passivo)
  e o resgate **D Gift Cards a Resgatar / C Receita de Gift Cards**; o saldo é
  derivado dos resgates (status `redeemed` ao zerar; validade opcional).
- **Pontos** (`loyalty_points` + `loyalty_settings`): configuração por tenant
  (`is_active`, `points_per_real`, `redeem_points_per_real`). Ao **quitar a
  comanda**, credita pontos (idempotente por comanda). O **resgate** converte
  pontos em **crédito na carteira**: **D Despesa de Fidelidade / C Carteira**,
  com a transação de carteira correspondente (`src/lib/loyalty.ts`).
- **Campanhas** (`campaigns`): segmento do CRM (novos/ativos/em risco/inativos/
  VIP/aniversariantes) respeitando o `marketing_opt_in`; enfileira e-mails na
  caixa de saída existente (envio real ainda depende de provedor configurado).

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
