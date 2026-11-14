# Como o GlowHub funciona (guia de implementação)

> Este documento descreve **o que o código faz em tempo de execução**: o caminho
> de uma requisição, como o tenant e a RLS são aplicados, como cada fluxo grava
> no banco e no ledger, e onde ficam as peças. Ele complementa:
>
> - [`architecture.md`](architecture.md) — decisões e modelo de dados;
> - [`relatorio-projeto.md`](relatorio-projeto.md) — escopo, status e backlog;
> - [`banco-e-ambientes.md`](banco-e-ambientes.md) — migrations e ambientes.
>
> Última revisão: 2026-11-09, conferida contra o código do commit `3fcd13e`.

## 1. Modelo mental em cinco camadas

```
Navegador
   │  HTML/RSC + chamadas de Server Action
   ▼
src/proxy.ts                 → resolve o slug do tenant pelo host e injeta x-tenant-slug
   ▼
src/app/(app)/layout.tsx     → sessão, tenant ativo, navegação, aviso de somente leitura
   ▼
page.tsx (RSC)               → lê com withUser(userId) e monta a tela
   ▼
actions.ts ("use server")    → valida, escreve com withUser(userId), revalida
   ▼
src/lib/*                    → regras (ledger, estoque, fidelidade, disponibilidade…)
   ▼
PostgreSQL (Neon)            → RLS + constraints + triggers
```

Regras que valem para todo o app:

- **Leitura** acontece em Server Components (`page.tsx`) e em `src/lib/*`. O app
  não expõe uma API REST para o painel.
- **Escrita** acontece em Server Actions (`actions.ts`, `"use server"`). Elas
  retornam um objeto `{ status: "idle" | "success" | "error", message?, fieldErrors? }`
  consumido por `useActionState` nos formulários.
- Toda ação segue o mesmo esqueleto: `context()` → validação Zod → `withUser` →
  regra de negócio → `revalidatePath`.
- O **tenant ativo** e o **usuário** nunca vêm do corpo do formulário; vêm da
  sessão e do perfil. IDs de recursos vindos do formulário são sempre filtrados
  por `tenant_id` na consulta.
- Dinheiro é **inteiro em centavos** (`bigint`) do banco até a tela. Texto vira
  centavos em `src/lib/money.ts`; a UI formata com `formatCentsBRL`.

## 2. O ciclo de uma requisição autenticada

### 2.1 GET de uma página do painel

1. `src/proxy.ts` (o "middleware" do Next 16) lê o host, resolve o slug
   (`<slug>.localhost`, `<slug>.NEXT_PUBLIC_ROOT_DOMAIN`, `?tenant=` ou
   `DEFAULT_TENANT_SLUG`) e grava `x-tenant-slug` nos headers da requisição.
2. `src/app/(app)/layout.tsx`:
   - sem configuração de banco → mostra `<SetupNotice />` em vez de quebrar;
   - sem sessão → `redirect("/login")`;
   - em paralelo, carrega `getCurrentTenant()`, `getUserTenants()` e
     `getMyProfessional()`;
   - se `tenant.isReadOnly` → mostra a faixa "Modo demonstração".
3. `page.tsx` chama `getCurrentTenant()`, depois `withUser(userId, tx => …)` e
   consulta as tabelas já filtradas por `tenant.id`.
4. Os dados chegam aos componentes `"use client"` como props serializáveis; o
   cliente só renderiza e chama ações.

`getCurrentTenant()` é memoizado com `cache()` do React: uma leitura por
requisição, mesmo chamado em layout, página e ação.

### 2.2 POST de uma Server Action

```
createChargeAction(appointmentId)
  context()                     → getCurrentTenant + getSession
  isUuid / Zod                  → rejeita entrada inválida antes do banco
  withUser(userId, async tx =>  → abre transação, injeta claims e a flag de demo
    SELECT ... WHERE tenant_id  → RLS também filtra; o filtro explícito é cinto e suspensório
    INSERT/UPDATE               → + lançamentos no ledger na mesma transação
  )
  revalidatePath("/finance")    → invalida o cache da rota
  return { status, message }    → formulário mostra o resultado
```

Consequências práticas:

- Uma ação é **atômica**: se o lançamento contábil falhar, a cobrança inteira
  volta atrás.
- `UPDATE ... .returning()` vazio é usado como teste de permissão: a RLS
  simplesmente não enxerga a linha e a ação responde "sem permissão".
- Erros do Postgres são traduzidos em `src/lib/db-errors.ts`,
  `src/lib/appointment-errors.ts` e `src/lib/errors.ts`. Não vaze mensagem crua
  do banco para a tela.

### 2.3 Navegação mobile e modo solo

- Em telas pequenas a sidebar some (`sm:flex`) e entra a `MobileNav`
  (`src/app/(app)/mobile-nav.tsx`): **Hoje, Agenda, Clientes, Caixa e Mais**. O
  “Mais” abre uma folha com todos os módulos, inclusive os que não cabem na
  barra inferior.
- O layout reserva `pb-28` no mobile para a barra fixa e usa
  `env(safe-area-inset-bottom)` para aparelhos com gesto.
- `tenants.is_solo` liga o **modo solo**: o onboarding cria profissional
  vinculado ao dono, um serviço inicial, horário seg–sáb e o plano de contas;
  o dashboard vira “Hoje” com checklist do que falta; o menu “Mais” esconde
  Filiais/Equipe do grupo principal.
- O modo solo pode ser ligado/desligado depois em `/settings` (owner/admin).

## 3. Identidade e sessão

- **Better Auth self-hosted** em `src/lib/auth.ts`, com `drizzleAdapter` sobre a
  conexão admin. Tabelas: `user`, `session`, `account`, `verification`.
- A instância é criada **sob demanda** (Proxy em `auth.ts`): o módulo pode ser
  avaliado no build sem `DATABASE_URL`.
- A sessão usa cookie do Better Auth com cache de 5 minutos. `getSession()` fica
  em `src/lib/session.ts` e é a única porta de leitura da sessão.
- `POST /api/auth/[...all]` aplica **rate limit** antes de entregar ao Better
  Auth: 10 tentativas de sign-in por minuto e 5 sign-ups por 5 minutos, por IP
  (`src/app/api/auth/[...all]/route.ts`). O limiter é *fail-open*.
- **Login demo** (`src/app/(auth)/login/demo-actions.ts`):
  - só funciona com `APP_ENV` `demo` ou `dev` **e** `NEXT_PUBLIC_DEMO_LOGIN=true`
    **e** `DEMO_PASSWORD` definido (`src/lib/app-env.ts`);
  - cria (ou recria) o usuário demo, garante `owner` em `demo` e nos tenants
    extras (`DEMO_EXTRA_TENANTS`), aponta `profiles.active_tenant_id` para o
    principal e vincula a conta a um profissional sem usuário — é o que habilita
    "Minha agenda" no ambiente de demonstração;
  - tem rate limit próprio (30 tentativas / 5 min).
- **Convite**: `POST` da tela `/invite/[token]` chama a função
  `public.accept_invitation(token)` (`db/rls.sql`). Ela roda como
  `SECURITY DEFINER`, valida expiração e e-mail do usuário logado, faz upsert em
  `memberships` e apaga o convite. O token expira em 7 dias e é enviado por link
  (não há e-mail de convite).
- **Troca de tenant**: atualiza `profiles.active_tenant_id`; não há refresh de
  token nem novo login.

## 4. Isolamento por tenant (RLS)

### 4.1 Duas conexões, dois poderes

| Conexão | Variável | Role | RLS | Usada para |
|---|---|---|---|---|
| `getDb()` | `DATABASE_URL` | owner (`neondb_owner`) | **não** | Better Auth, onboarding, `/book`, webhooks, cron, rate limit, seed, lookup de tenant por slug |
| `withUser(userId, cb)` | `DATABASE_AUTHENTICATED_URL` | `glowhub_app` | **sim** | todo o painel autenticado |

`withUser` abre uma transação e executa, antes do callback:

```sql
select set_config('request.jwt.claims', '{"sub": "<userId>"}', true);
select set_config('app.demo_readonly', 'on'::text, true); -- ou 'off'
```

As policies leem `public.auth_uid()` desse claim. **A conexão admin ignora a
RLS**: toda query feita com `getDb()` no código de produto precisa filtrar
`tenant_id` explicitamente. Os pontos que fazem isso hoje são `/book`,
`/api/webhooks/*`, `/api/cron/subscriptions`, `accept_invitation` e o rate limit.

### 4.2 Quem lê e quem escreve

| Tabelas | Leitura | Escrita |
|---|---|---|
| `tenants` | membros | `owner`, `admin` |
| `branches`, catálogo, produtos, fornecedores, agenda (horários/bloqueios), plano de contas, pacotes/planos/cupons, gift cards, config. de fidelidade e campanhas | membros | `owner`, `admin`, `manager` |
| `clients`, `appointments`, `charges`, `charge_items`, `payments`, `earnings`, `wallet_transactions`, pacotes/assinaturas vendidos, resgates, `notifications`, `stock_movements`, pontos e resgates | membros | `owner`, `admin`, `manager`, `staff` |
| `memberships`, `invitations` | membros (membros veem o próprio vínculo; gestores veem os demais) | `owner`, `admin` |
| `profiles` | o próprio usuário e colegas de tenant | o próprio usuário |
| `journal_entries`, `journal_lines` | membros | **insert** por `owner/admin/manager/staff`; sem update/delete |
| `accounting_periods` | membros | `owner`, `admin` |
| `webhook_events`, `rate_limits`, tabelas do Better Auth | **sem acesso** pela role do app | conexão admin |

`viewer` é um papel de leitura: não aparece em nenhuma policy de escrita.

### 4.3 Append-only e balanceamento

- `journal_entries` e `journal_lines`: `revoke update, delete` para
  `glowhub_app` **e** trigger `prevent_ledger_mutation` que levanta exceção em
  `UPDATE`. Correção é lançamento reverso (`reverses_entry_id`).
- `stock_movements`, `loyalty_points` e `gift_card_redemptions`: só insert.
- Ao final do commit, a *constraint trigger* deferida `journal_lines_balanced`
  confere débitos = créditos por lançamento. Um insert desbalanceado aborta a
  transação inteira.
- O livro **não tem coluna de saldo**: balancete, resultado e saldos são
  derivados das partidas (`src/lib/accounting.ts`).

### 4.4 Modo demonstração (somente leitura)

Os três tenants do seed (`demo`, `studio-bella`, `clinica-lumina`) têm
`tenants.is_read_only = true`. Um trigger `enforce_readonly_tenant` roda em
`INSERT/UPDATE/DELETE` das tabelas "destrutivas" (catálogo, agenda configurada,
equipe, financeiro, cupons, pacotes, assinaturas, mensagens) e levanta
`tenant_read_only`.

Exceções deliberadas:

- `clients` e `appointments` **não** têm o trigger: a demonstração continua
  permitindo agendar, fazer check-in/checkout e mexer em clientes.
- A conexão admin não envia `request.jwt.claims`; portanto seed, login demo,
  onboarding, cron e `/book` continuam escrevendo.
- `DEMO_READ_ONLY=false` desliga o guard para testes/preview
  (`src/lib/db.ts` → `app.demo_readonly = 'off'`). O padrão (`true`) é ligado.

A UI avisa no layout quando `tenant.isReadOnly`; não é uma checagem de
segurança — a trava real está no banco.

### 4.5 Erros de banco que o app traduz

| SQLSTATE / mensagem | Significado | Onde é tratado |
|---|---|---|
| `42501` | papel sem permissão na RLS | ações devolvem "seu papel não permite…" |
| `23505` | unicidade (código, slug, e-mail, idempotência) | mensagens de campo |
| `23P01` | sobreposição de agendamento (`appointments_no_overlap`) | `overlapMessage` |
| `tenant_read_only` | escrita em tenant de demonstração | `internalError`/mensagem de demo |
| `accounting_period_closed` | lançamento em período fechado | `postEntry` lança; ação devolve erro |
| `... is not balanced` | partidas desbalanceadas | constraint trigger no commit |

## 5. Agenda e disponibilidade

### 5.1 Como um horário é calculado

`src/lib/availability.ts` é **puro** (minutos desde 00:00, sem fuso):

1. Horário da filial no dia da semana (`branch_hours`, vários intervalos).
2. Se o profissional tem horários próprios (`professional_hours`), usa a
   **interseção** com a filial; se não tem nenhum, **herda** a filial.
3. Remove `branch_closures` do dia (feriado/folga) e intervalos de bloqueio.
4. Remove os compromissos (`busy`) do profissional.
5. Gera inícios de slot a cada 30 min (`STEP_MINUTES`), exigindo que o serviço
   inteiro caiba no intervalo.

`src/lib/availability-data.ts` carrega o contexto do banco:

- filial (e seu `timezone`), serviço, vínculos profissional↔serviço e
  profissional↔filial; sem vínculo, o serviço não é oferecido;
- preço/duração: padrão do serviço, sobrescrito por `service_branches`
  (`is_active = false` torna o serviço indisponível naquela filial);
- `busy`: agendamentos do profissional no dia, exceto `cancelled` e `no_show`
  (a mesma regra da constraint de sobreposição);
- converte data/hora local da filial para `timestamptz` com
  `zonedTimeToUtc` (`src/lib/timezone.ts`).

### 5.2 Agendamento pelo painel

1. O formulário consulta `getAvailabilityAction` enquanto o usuário escolhe
   filial/profissional/serviço/data.
2. Ao salvar, `createAppointmentAction` **recalcula os slots dentro da
   transação** e exige que o horário escolhido ainda esteja na lista. Isso evita
   confiar no que o cliente enviou.
3. O insert grava `price_cents` como **snapshot** (preço já com override da
   filial), `starts_at`/`ends_at` em UTC e status `pending`.
4. Duas requisições concorrentes: a *exclusion constraint*
   `appointments_no_overlap` (migration `0002`) barra a segunda com `23P01`,
   mesmo que as duas tenham passado pela checagem de disponibilidade.

### 5.3 Agendamento online (`/book`)

- O tenant público vem **só do host** (`getPublicTenant`), com fallback em
  `DEFAULT_TENANT_SLUG`. Header `x-tenant-slug` e `?tenant=` são ignorados de
  propósito: são influenciáveis pelo visitante.
- Rate limit: 60 consultas de disponibilidade/minuto e 10 reservas/10 minutos
  por IP.
- A reserva roda na conexão admin com `tenant_id` explícito, porque não há
  sessão. O cliente é reaproveitado por telefone **ou** e-mail; se não existir,
  é criado. O agendamento nasce `pending` e, havendo e-mail, uma mensagem é
  enfileirada em `notifications`. A mesma rotina é usada pela API v1 em
  `/api/v1/public/bookings` (`src/lib/public-booking.ts`).

### 5.4 Estados e políticas

Transições aceitas (`src/app/(app)/appointments/types.ts`):

| De | Para |
|---|---|
| `pending` | `confirmed`, `cancelled`, `no_show` |
| `confirmed` | `check_in`, `cancelled`, `no_show` |
| `check_in` | `checkout`, `cancelled` |
| `checkout` | `completed`, `cancelled` |
| `completed`, `cancelled`, `no_show` | — |

- **Janela de cancelamento** (`tenants.cancellation_window_hours`): dentro da
  janela, só `owner/admin/manager` cancelam; `staff` recebe erro.
- **No-show** (`tenants.no_show_fee_percent`): ao marcar, cria uma cobrança com
  a taxa percentual (se ainda não houver cobrança do agendamento) e lança
  **D Contas a Receber / C Receita de Serviços**. Não gera comissão.
- A tela `/my-schedule` é a visão do profissional vinculado
  (`professionals.user_id`) e permite mexer no status dos próprios atendimentos.

> **Nota:** a disponibilidade e a constraint `appointments_no_overlap` usam a
> mesma regra: `cancelled` e `no_show` não ocupam o horário. Um horário com
> no-show volta a aparecer na agenda e pode ser reaproveitado.

## 6. Financeiro (o núcleo)

### 6.1 Plano de contas e chaves de sistema

`createDefaultChartAction` cria o plano padrão (24 contas) e é o único lugar que
define as `system_key` usadas pelo código. As principais:

| Chave | Conta | Tipo |
|---|---|---|
| `cash`, `bank` | Caixa, Banco | ativo |
| `accounts_receivable` | Contas a Receber | ativo |
| `asset_inventory` | Estoque | ativo |
| `liability_payable`, `liability_commission`, `liability_tip` | Contas a Pagar, Comissões a Pagar, Gorjetas a Pagar | passivo |
| `liability_wallet`, `liability_package`, `liability_deferred_revenue`, `liability_gift_card` | Carteira, Pacotes a Resgatar, Receitas a Apropriar, Gift Cards a Resgatar | passivo |
| `revenue_service`, `revenue_product`, `revenue_package`, `revenue_subscription`, `revenue_gift_card` | receitas 4.1–4.5 | receita |
| `expense_commission`, `expense_discount`, `expense_cogs`, `expense_inventory_loss`, `expense_loyalty` | despesas 5.2–5.7 | despesa |

O onboarding **não** cria o plano automaticamente: a tela `/finance` mostra o
botão para aplicar o plano padrão. Sem as contas, as ações devolvem "Crie o plano
de contas padrão em Financeiro.".

### 6.2 `postEntry`: o único caminho para o livro

`src/lib/ledger.ts`:

1. Recusa lançamento cuja data (`occurred_at` em UTC) caia em período fechado.
2. Insere `journal_entries` com `idempotency_key` única por tenant.
3. Insere as `journal_lines` (cada uma com débito **ou** crédito, valor > 0).
4. No commit, a trigger deferida confere débitos = créditos.

A idempotência **não é um upsert**: repetir a mesma chave gera `23505`. Quem
chama deve evitar a repetição (checar se a cobrança já existe, usar o status do
pagamento etc.) ou tratar o erro. As chaves em uso são previsíveis e
documentadas no próprio código (`charge-revenue-<id>`, `payment-<id>`,
`commission-<id>`, `cogs-item-<id>`, etc.).

### 6.3 Fluxos e partidas

| Operação | Débito | Crédito | Chave de idempotência |
|---|---|---|---|
| Gerar cobrança do atendimento | Contas a Receber | Receita de Serviços | `charge-revenue-<charge>` |
| Comissão ao gerar a cobrança | Comissões (despesa) | Comissões a Pagar | `commission-<charge>` |
| Pagamento manual (dinheiro/cartão/Pix) | Caixa ou Banco | Contas a Receber | `payment-<payment>` |
| Pagamento com carteira | Carteira (passivo) | Contas a Receber | `payment-<payment>` |
| Gorjeta no pagamento | Caixa/Banco (junto) | Gorjetas a Pagar | `payment-<payment>` |
| Recarga de carteira | Caixa ou Banco | Carteira | `wallet-topup-<tx>` |
| Repasse ao profissional | Comissões a Pagar + Gorjetas a Pagar | Caixa ou Banco | `payout-<payout>` |
| Venda de pacote | Caixa ou Banco | Pacotes a Resgatar | `package-sale-<sold>` |
| Resgate de pacote | Pacotes a Resgatar | Receita de Serviços | (UUID por resgate) |
| Cupom em cobrança aberta | Descontos e Estornos | Contas a Receber | `coupon-<charge>-<coupon>` |
| Venda de gift card | Caixa | Gift Cards a Resgatar | `gift-card-sale-<card>` |
| Resgate de gift card | Gift Cards a Resgatar | Receita de Gift Cards | `gift-card-redeem-<redemption>` |
| Resgate de pontos | Despesa de Fidelidade | Carteira | `loyalty-redeem-<redemption>` |
| Faturamento/renovação de assinatura | Caixa/Banco | Receitas a Apropriar | `subscription-<sub>-<período>` |
| Reconhecimento de receita diferida | Receitas a Apropriar | Receita de Assinaturas | `subscription-recog-<sub>-<período>` |
| Entrada de estoque | Estoque | Caixa **ou** Contas a Pagar | `purchase-<purchase>` |
| CMV por item | Custo de Produtos e Serviços | Estoque | `cogs-item-<item>` |
| Remoção de produto da comanda | Estoque | Custo de Produtos e Serviços | `cogs-return-<item>` |
| Estorno de cobrança aberta | reverso de cada partida | reverso de cada partida | `void-<entry>` |

### 6.4 Ciclo da comanda

1. **Abrir** (`createChargeAction`): só para agendamento com preço > 0 e sem
   cobrança existente (`charges_appointment_key`). Cria `charges` + um
   `charge_items` de serviço, baixa insumos da ficha técnica (CMV), lança a
   receita e a comissão.
2. **Adicionar produto** (`addChargeItemAction`): apenas produto `resale` ativo,
   com quantidade inteira. Cria o item, lança receita de produto e baixa o
   estoque (`consumeChargeItem`), tudo na mesma transação.
3. **Remover produto** (`removeChargeItemAction`): só com a comanda aberta e
   sem pagamentos que cubram o item. Estorna a receita, devolve o estoque e
   estorna o CMV; depois apaga o item.
4. **Pagar** (`registerPaymentAction`): aceita pagamento parcial; a cobrança vira
   `paid` quando a soma confirmada cobre o total. Com `method = wallet`, valida o
   saldo da carteira e grava `wallet_transactions` negativa. Gorjeta é opcional e
   vira `earnings` (tipo `tip`). Ao quitar, credita pontos de fidelidade.
5. **Cobrar online** (`createOnlinePaymentAction`): cria um `payment` pendente
   com `provider`/`provider_ref` e devolve o link de checkout do adapter ativo.
6. **Conciliar** (`/reconciliation`) ou receber o webhook: confirma o pagamento
   pendente com a mesma função `confirmPendingPayment`
   (`src/lib/payments/confirm.ts`), que também credita pontos e marca a cobrança
   como paga. Um pagamento pendente pode ser **cancelado** ali (`failed`, sem
   efeito no ledger) para liberar a comanda; se o provedor confirmar depois, o
   webhook ainda recupera o pagamento para `confirmed`.
7. **Estornar** (`voidChargeAction`, `src/lib/charge-void.ts`): só para cobrança
   aberta, sem pagamento pendente/confirmado e sem comissão paga. Lança o reverso
   de cada partida (receita, cupom, CMV e comissão pendente), devolve o estoque
   consumido (produto e ficha técnica, sem relançar o CMV), libera o cupom, marca
   `earning.status = 'void'` e grava `charges.voided_*` com autor/motivo. A
   constraint de cobrança única por agendamento passou a ignorar `void`, então o
   atendimento pode ser cobrado de novo.

### 6.5 Pagamento online e webhooks

- Provedores em `src/lib/payments/*`: `mock` (padrão), `mercadopago`
  (Checkout Pro) e `infinitepay` (Checkout Integrado). A interface é
  `createCheckout`, `verifyWebhook`, `parseWebhook`.
- `POST /api/webhooks/<provider>`:
  1. rejeita provedor inválido e corpo > 256 KB;
  2. busca o segredo em `WEBHOOK_<PROVIDER>_SECRET` ou `WEBHOOK_SECRET`; **sem
     segredo, responde 503** quando o adapter exige segredo (padrão). Adapters
     com `requiresSecret: false` (InfinitePay) confirmam o evento por API;
  3. valida a assinatura com o adapter (Mercado Pago: `x-signature` +
     `x-request-id` + `data.id`; InfinitePay: `/payment_check` com
     `order_nsu` + `transaction_nsu` + `slug`) ou com HMAC-SHA256 genérico do
     corpo (`x-webhook-signature`/`x-signature`);
  4. grava em `webhook_events` com unique `(provider, event_id)`, guardando
     payload, URL e status `pending`;
  5. com adapter, aplica `approved` (confirma), `rejected` (marca `failed`) ou
     `refunded` (estorna no ledger);
  6. emite métrica e alerta em caso de falha.
- **Retry/fila**: uma falha marca o evento como `failed`, incrementa `attempts` e
  agenda `next_attempt_at` com backoff (1min, 5min, 15min, 1h, 6h; no máximo 6
  tentativas). `/api/cron/webhooks` (diário, `Bearer CRON_SECRET`) drena
  pendentes/falhos. Se o provedor reenviar o mesmo evento antes disso, o endpoint
  reconhece o duplicado e tenta processar de novo (em vez de responder 200 e
  perder o evento). O processamento é idempotente no ledger e no pagamento.
- O mock local (`/pay/mock`) simula a aprovação/recusa; a ação está bloqueada
  quando `NODE_ENV === "production"`.

### 6.6 Assinaturas e receita diferida

- O faturamento lança **D Caixa/Banco / C Receitas a Apropriar**; a receita só é
  reconhecida ao final do período, com **D Receitas a Apropriar / C Receita de
  Assinaturas**.
- `/api/cron/subscriptions` (Vercel Cron diário, `Bearer CRON_SECRET`) percorre
  os tenants ativos e chama `billDueSubscriptions`
  (`src/lib/subscription-billing.ts`): reconhece o período vencido, fatura o
  próximo e avança `current_period_start/end`. É idempotente por
  `subscription-<id>-<início do período>`.
- Renovação manual (`renewSubscriptionAction`) faz o mesmo pelo botão, mas usa
  chave com UUID — duas execuções manuais não são idempotentes entre si.

### 6.7 Fechamento contábil

- `/closing` cria `accounting_periods` com status `closed` e um snapshot JSON do
  balancete do intervalo.
- `postEntry` consulta períodos fechados antes de inserir e recusa a data.
- Reabrir (`reopenPeriodAction`) volta o status para `open`; só `owner/admin`.
- Períodos fechados sobrepostos são recusados.

### 6.8 Relatórios

- `/reports`: balancete do período, resultado (receita − despesa), recebimentos
  por forma, comissões/gorjetas por profissional, receita por dia e ocupação.
- `/reports/profitability`: DRE (`src/lib/profitability.ts`) — receita,
  deduções (`expense_discount`), CMV (`expense_cogs`), lucro bruto, despesas
  operacionais, lucro líquido; margem por serviço/produto; fluxo de caixa
  realizado (débitos em Caixa/Banco) vs. competência.

## 7. Estoque e insumos

- Produto tem `kind`: `resale` (vendido na comanda) ou `internal` (insumo, só
  consumido por ficha técnica). Preço, custo, estoque e mínimo vivem na
  **variação** (`product_variants`).
- `stock_movements` é append-only: `purchase`, `sale`, `sale_return`,
  `service_consumption`, `adjustment`, `loss`, `opening`. Cada movimento tem
  `quantity_delta` assinado, custo unitário e referência.
- `recordPurchase` atualiza o saldo, recalcula o **custo médio ponderado**
  (`movingAverageCost`) e lança **D Estoque / C Caixa ou Contas a Pagar**.
- `consumeChargeItem` baixa a variação do produto ou os insumos da ficha
  técnica do serviço e lança o CMV. A chave `(referência, variação, tipo)` evita
  baixa dupla.
- `stock_quantity` **pode ficar negativa**: a baixa nunca bloqueia a comanda.
  `listLowStock` e `/inventory` sinalizam reposição.
- Ajuste/perda lança a diferença pelo custo unitário e é idempotente pelo id do
  movimento.

## 8. Fidelização, carteira e campanhas

- **Gift cards**: venda = **D Caixa / C Gift Cards a Resgatar**; resgate (parcial
  ou total) = **D Gift Cards a Resgatar / C Receita de Gift Cards**. O saldo é
  `valor inicial − resgates`; o status vira `redeemed` ao zerar.
- **Pontos**: `loyalty_settings` por tenant (`is_active`, `points_per_real`,
  `redeem_points_per_real`). `awardChargePoints` credita ao quitar a comanda e é
  idempotente por `(comanda, earn)`. Resgate converte pontos em crédito na
  carteira, com **D Despesa de Fidelidade / C Carteira** e uma
  `wallet_transactions`.
- **Carteira**: saldo é a soma de `wallet_transactions` (positivo = crédito,
  negativo = uso). Recarga e uso passam pelo ledger; o pagamento com carteira
  valida saldo antes de debitar.
- **Campanhas**: segmento (`novo`, `ativo`, `em_risco`, `inativo`, `vip`,
  `aniversariantes` ou todos) respeitando `marketing_opt_in`; apenas enfileira
  e-mails na caixa de saída. O envio real depende do adapter configurado.

## 9. Notificações

- `notifications` é uma caixa de saída (canal, destinatário, assunto, corpo,
  status `pending/sent/failed`, erro, `scheduled_for` e `dedupe_key`).
- `enqueueEmail` grava a mensagem na transação de quem a originou (booking,
  convite de equipe ou lembrete) e aceita `scheduledFor` e `dedupeKey`. A chave
  única `(tenant_id, dedupe_key)` evita duplicar o mesmo lembrete/convite.
- **Lembretes**: ao criar um agendamento (painel ou `/book`), o sistema enfileira
  um lembrete para 24h antes; o cron diário também varre os atendimentos das
  próximas 36h (`enqueueUpcomingReminders`) para cobrir dados criados fora dos
  fluxos. Cancelar ou marcar no-show remove o lembrete pendente.
- `processNotificationsAction` (`/notifications`) envia apenas o que está
  vencido (`scheduled_for` nulo ou <= agora). `processDueNotifications` faz o
  mesmo pelo cron, na conexão admin.
- **Convite de equipe**: o envio do link `/invite/<token>` é enfileirado junto
  com o convite; o envio real depende do adapter configurado.
- `/api/cron/daily` drena webhooks, enfileira lembretes e envia notificações
  vencidas uma vez por dia. **Limitação:** a granularidade é diária; um
  agendamento criado poucas horas antes depende do próximo cron ou do botão
  manual em `/notifications`.
- **Push**: `push_tokens` guarda o token Expo por usuário/tenant; o app registra
  após o login e o booking público dispara “Novo agendamento” para os aparelhos
  do tenant. O envio real exige `projectId` EAS e development build no Android.
- `src/lib/email.ts`: Resend se `RESEND_API_KEY` existir; senão loga no console
  e devolve sucesso de desenvolvimento.

## 10. Integrações e operação

| Rota | Autenticação | O que faz |
|---|---|---|
| `/api/health` | pública | `select 1`; 503 sem configuração ou banco fora |
| `/api/metrics` | `Bearer METRICS_TOKEN` | snapshot em memória; 404 se o token não existe |
| `/api/cron/subscriptions` | `Bearer CRON_SECRET` | renova assinaturas vencidas |
| `/api/cron/daily` | `Bearer CRON_SECRET` | webhooks + lembretes + envio de notificações |
| `/api/cron/webhooks` | `Bearer CRON_SECRET` | reprocessa webhooks sob demanda (não agendado na Vercel) |
| `/api/webhooks/<provider>` | assinatura HMAC | confirma/estorna pagamentos |
| `/api/auth/[...all]` | Better Auth + rate limit | login/cadastro/sessão |
| `/api/v1/*` | Bearer/cookie ou slug público | API do app (ver [`api-mobile.md`](api-mobile.md)) |
- **Métricas** (`src/lib/metrics.ts`): `recordMetric` acumula em memória **e**
  sempre emite um log JSON (`message: "metric"`). Com `METRICS_WEBHOOK_URL`,
  envia POST best-effort. Contadores são por instância serverless.
- **Alertas** (`src/lib/alerts.ts`): sempre loga; com `ALERT_WEBHOOK_URL`
  empurra payload compatível com Slack/Discord/Mattermost a partir de
  `ALERT_MIN_LEVEL` (padrão `error`), com supressão por título em
  `ALERT_COOLDOWN_SECONDS` (padrão 300).
- **Rate limit** (`src/lib/rate-limit.ts`): fixed-window na tabela interna
  `rate_limits`, via conexão admin; fail-open.
- **App mobile** (`mobile/`): Expo Router SDK 58; login em `/api/v1/auth/login`,
  token no SecureStore e agenda em `/api/v1/me` + `/api/v1/appointments`, com
  ações de status via `PATCH /api/v1/appointments/:id/status`, booking público
  e registro de push. O `EXPO_PUBLIC_API_URL` aponta para a API e
  `EXPO_PUBLIC_TENANT_SLUG` para o salão do booking; push exige projectId EAS.
- **Assistente de IA** (`/assistant`): server action autenticada monta um resumo
  somente-leitura da empresa (agenda de hoje, próximos 7 dias, serviços,
  clientes, recebido hoje e em aberto) com `withUser` (RLS) e chama a OpenRouter
  (`OPENROUTER_API_KEY`, padrão `google/gemini-2.5-flash`). Rate limit de 20
  perguntas/5 min por usuário; sem a chave, a página só mostra o aviso.

## 11. Ambientes e deploy

`APP_ENV` define o comportamento de demonstração:

| `APP_ENV` | Onde | Login demo | Seed demo |
|---|---|---|---|
| `demo` | Vercel Production (vitrine) | ligado se as duas variáveis existirem | exige `--confirm-demo` |
| `dev` | local, e2e, Preview | ligado se as duas variáveis existirem | roda livre |
| `production` (padrão) | banco de produção futuro | desligado | recusa |

- A demo no ar usa o branch Neon `production` **como vitrine**; o `dev` é branch
  separado. Detalhes em [`banco-e-ambientes.md`](banco-e-ambientes.md).
- Migrations são versionadas em `drizzle/`; `db/rls.sql` é reaplicado inteiro
  pelo `npm run db:migrate`. O CI falha se o schema mudar sem migration.
- O deploy é automático a partir de `master` na Vercel. Migrations no banco da
  demo são aplicadas à mão antes do merge (o CI não tem credencial de owner).
- `vercel.json` agenda dois crons diários: assinaturas às 06:00 UTC e manutenção
  (webhooks + lembretes + envio) às 06:30 UTC.

## 12. Testes e verificação

- **Unitários (Vitest, 19 arquivos / 117 casos)**: dinheiro, fuso,
  disponibilidade, erros de banco/agendamento, estoque, fidelidade, CRM,
  lucratividade, assinatura/retry de webhook, estorno de cobrança, lembretes,
  push, métricas, alertas e `APP_ENV`.
- **e2e (Playwright, 16 cenários + setup de auth)**: login demo, minha agenda
  (vínculo e mudança de status), histórico do cliente, booking público,
  assinaturas, fechamento, API v1 pública, navegação mobile e 7 verificações de
  acessibilidade com axe.
- **Smoke scripts** (`scripts/`): `smoke-rls`, `smoke-ledger`, `smoke-overlap`,
  `check-overlaps` e `schema-snapshot`.
- Quality gate: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

## 13. Receitas de mudança

### Novo campo/tabela

1. Edite `src/db/schema/*.ts`.
2. `npm run db:generate` e revise o SQL.
3. `npm run db:migrate` no dev.
4. Se houver policy/trigger/grant novo, edite `db/rls.sql` (ele é reaplicado).
5. Commite schema + migration juntos; o CI cobra isso.

### Novo lançamento contábil

1. Escolha/crie a `system_key` em `createDefaultChartAction` (e no plano padrão).
2. Use `postEntry` com uma `idempotency_key` determinística.
3. Garanta que a soma dos débitos = créditos e que o valor é inteiro.
4. Trate duplicidade (`23505`) ou evite a repetição antes de inserir.
5. Adicione teste puro da regra e, se tocar em dinheiro, um smoke no ledger.

### Nova tela/módulo

1. `page.tsx` (RSC) com `export const dynamic = "force-dynamic"` quando ler dados.
2. `actions.ts` com `"use server"`, Zod e `withUser`.
3. Componentes `"use client"` só para formulários/listas interativas.
4. Link no `src/app/(app)/layout.tsx` (e restrição por papel quando necessário).
5. Adicione rota à lista do `relatorio-projeto.md` e, se tiver fluxo novo, aqui.

### Novo provedor de pagamento

1. Implemente `PaymentProviderAdapter` em `src/lib/payments/<provider>.ts`.
2. Registre em `ADAPTERS` (`src/lib/payments/index.ts`).
3. Defina `WEBHOOK_<PROVIDER>_SECRET` e a validação de assinatura — ou
   `requiresSecret: false` se o provedor confirmar o evento por API (como a
   InfinitePay no `/payment_check`).
4. Teste o parse de status (`approved`/`rejected`/`refunded`) e a idempotência.

## 14. Limitações conhecidas

- **Verificação de e-mail** no cadastro ainda não existe (o convite por e-mail
  já enfileira na caixa de saída).
- O agendador é **diário** (cron), sem worker/fila em tempo real; lembretes de
  última hora dependem do botão manual em `/notifications`.
- Canais push/SMS não implementados.
- App mobile e API pública para ele não existem.
- Billing da própria plataforma (planos do SaaS) não existe; as assinaturas são
  vendidas ao cliente final do salão.
- Storage de arquivos por tenant não existe (logo/imagem só por URL).
- Não há **conciliação automática** de extrato bancário; a conciliação é manual
  (`/reconciliation`) e o webhook cobre o gateway.
- Renovação manual de assinatura usa chave não determinística (seção 6.6).
- O retry de webhooks e o envio de lembretes são por cron diário; não há fila em
  tempo real (o provedor reenvia imediatamente e o endpoint tenta de novo).
- A conexão admin é um poder à parte: qualquer query nova com `getDb()` precisa
  de escopo explícito de tenant.
