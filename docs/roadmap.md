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
- [x] Clientes (histórico via agenda)

## Fase 4 — Financeiro (concluída)
- [x] Chart of accounts + **ledger de partidas dobradas** (centavos)
- [x] Cobrança de atendimento (`charges`/`charge_items`; serviços; produtos/pacotes via `kind`)
- [x] Pagamentos **idempotentes** + webhooks + conciliação (manual; gateway a integrar)
- [x] Gorjeta, comissão e repasses
- [x] Carteira do cliente (crédito pré-pago; pagamento por carteira)
- [x] Relatórios (balancete, resultado, recebimentos, comissões/gorjetas) — fechamento formal pendente

## Fase 5 — Recorrência & comercial
- [x] Pacotes (pré-pago) e assinaturas (planos recorrentes com cobrança no ledger)
- [x] Cupons e promoções (percentual/fixo, validade, limite de uso)
- [x] Notificações por e-mail (caixa de saída + adapter portável); push e lembretes agendados pendentes

## Fase 6 — Canais
- [x] Website público / agendamento online (`/book`, por subdomínio/slug)
- [ ] App do cliente (mobile)

## Transversal (em todas as fases)
- [x] Onboarding de tenant (cadastro cria empresa + filial + owner)
- [x] CI (lint + typecheck + build no GitHub Actions)
- [x] Testes unitários (vitest: dinheiro, disponibilidade, fuso); e2e pendente
- [ ] Observabilidade (logs, métricas, alertas de pagamento)
- [ ] Segurança (revisão de policies, rate limit)
- [ ] Provedor de e-mail (verificação, convites, lembretes)
- [ ] Gateway de pagamento online e fechamento formal
