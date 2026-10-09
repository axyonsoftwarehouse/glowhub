# Roadmap do GlowHub

Construção incremental. Cada fase entrega algo utilizável e testável.

## Fase 0 — Fundação (concluída)
- [x] Projeto Next 16 + Tailwind + TypeScript + Neon + Drizzle + Better Auth
- [x] Tenancy: `tenants`, `branches`, `memberships`, `invitations`, `profiles`
- [x] RLS por `tenant_id` via `auth_uid()` (claims injetados por transação)
- [x] Resolução de tenant por subdomínio (`src/proxy.ts`)
- [x] Login/cadastro + shell autenticado + lista de filiais

## Fase 1 — Identidade & organização (concluída)
- [x] Convites de equipe (token por link; envio de e-mail pendente)
- [x] Edição/remoção de membros (papel + remover; revogar convite)
- [x] Troca de **tenant ativa** (atualizar `active_tenant_id` + refresh do JWT)
- [x] Gestão de filiais (criar/editar/desativar)
- [x] Perfil do usuário e preferências (nome, avatar, fuso, notificações)

## Fase 2 — Catálogo (concluída)
- [x] Categorias e serviços (duração, preço, imagem)
- [x] Preço/duração por filial (override)
- [x] Vínculo serviço ↔ profissional ↔ filial
- [x] Produtos (variações, estoque básico)

## Fase 3 — Agenda (concluída)
- [x] Horário de funcionamento, intervalos, feriados
- [x] Slots e disponibilidade por profissional/filial (com compromissos)
- [x] Agendamento (painel) + status/check-in/checkout
- [x] Clientes (histórico dedicado: atendimentos, cobranças/pagamentos, carteira)
- [x] Visão do profissional: "Minha agenda" (vínculo `professionals.user_id`) + status dos próprios atendimentos
- [x] Busca (`?q=`) e paginação nas listas (clientes, serviços, produtos, profissionais) + busca na agenda
- [x] Políticas de cancelamento/no-show por tenant (`/settings`)

## Fase 4 — Financeiro (concluída)
- [x] Chart of accounts + **ledger de partidas dobradas** (centavos)
- [x] Cobrança de atendimento (`charges`/`charge_items`; serviços; produtos/pacotes via `kind`)
- [x] Comanda: adicionar/remover produtos numa cobrança aberta, com receita dedicada
  (`revenue_product`), baixa de estoque na inclusão e estorno + devolução na remoção
- [x] Pagamentos **idempotentes** + webhooks + conciliação (tela `/reconciliation`; gateway real a integrar)
- [x] Gorjeta, comissão e repasses
- [x] Carteira do cliente (crédito pré-pago; pagamento por carteira)
- [x] Relatórios (balancete, resultado, receita/dia, recebimentos por forma, ocupação por profissional, comissões)
- [x] Fechamento contábil (trava de período + snapshot do balancete; `/closing`)

## Fase 5 — Recorrência & comercial
- [x] Pacotes (pré-pago) e assinaturas (planos recorrentes com cobrança no ledger)
- [x] Renovação automática de assinaturas (cron `/api/cron/subscriptions`) e consumo/limites por período
- [x] Receita diferida de assinaturas (faturamento em "Receitas a Apropriar", reconhecimento ao fim do período)
- [x] Cupons e promoções (percentual/fixo, validade, limite de uso)
- [x] Notificações por e-mail (caixa de saída + adapter portável); push e lembretes agendados pendentes

## Fase 6 — Canais
- [x] Website público / agendamento online (`/book`, por subdomínio/slug)
- [ ] App do cliente (mobile)

## Fase 7 — Relatórios & Inteligência de Negócio (BI)
- [x] CRM de clientes: aniversário, tags e preferências no cadastro; segmentação
  (novo/ativo/em risco/inativo) e VIP (percentil 90 de gasto); ticket médio,
  frequência, LTV, recência e "próximo retorno sugerido"; filtros/abas na lista
  e resumo na ficha do cliente (`src/lib/crm.ts`)
- [x] Custo & insumos (fundação): `product_variants.cost_cents`/`min_stock`/`unit`,
  produtos com `kind` (revenda/insumo), ficha técnica do serviço
  (`service_materials`), movimentos de estoque append-only (`stock_movements`),
  fornecedores + entrada de estoque com custo médio, baixa automática e CMV na
  cobrança, e alerta de reposição (`src/lib/inventory.ts`, `/inventory`)
- [x] Lucratividade & DRE: DRE (bruto→deduções→CMV→líquido), margem por
  serviço/produto com ranking lucro/prejuízo e **fluxo de caixa** vs. resultado
  (`src/lib/profitability.ts`, `/reports/profitability`)
- [x] Fidelização: gift cards (valor fixo + código; venda = passivo, resgate =
  receita), programa de pontos (acúmulo na comanda quitada, resgate como crédito
  na carteira) e campanhas por segmento (e-mail com opt-in via caixa de saída)
  (`src/lib/loyalty.ts`, `/loyalty`)

## Transversal (em todas as fases)
- [x] Onboarding de tenant (cadastro cria empresa + filial + owner)
- [x] CI (lint + typecheck + build no GitHub Actions)
- [x] Testes unitários (vitest) + e2e (Playwright: login demo, minha agenda, histórico do cliente, booking, assinaturas, fechamento, axe/a11y)
- [x] Observabilidade in-app (logger estruturado, `/api/health`, logs de webhook); métricas e alertas externos (`/api/metrics`, sink HTTP `METRICS_WEBHOOK_URL`, `sendAlert`/`ALERT_WEBHOOK_URL`)
- [x] Segurança (rate limiting no Better Auth, tabela interna `rate_limits`; revisão contínua de policies)
- [x] Acessibilidade (foco visível, skip link, labels/aria, contraste AA, axe e2e). Projeto **somente pt-BR** (sem i18n)
- [ ] Provedor de e-mail (verificação, convites, lembretes)
- [ ] Gateway de pagamento online
