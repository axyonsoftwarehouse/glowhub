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
- [x] Pagamentos **idempotentes** + webhooks + conciliação (tela `/reconciliation`)
- [x] **Gateway online**: adapter portável (**mock + Mercado Pago + InfinitePay**),
  link de checkout por comanda, webhook que confirma/estorna no ledger e
  conciliação manual em `/reconciliation` (`src/lib/payments/*`, `/pay/mock`).
  Mercado Pago usa assinatura HMAC; a InfinitePay confirma via `/payment_check`
- [x] **Estorno formal de cobrança** (reverso no ledger, estoque, cupom e
  comissão) e **retry de webhooks** com backoff (`/api/cron/webhooks`)
- [x] Gorjeta, comissão e repasses
- [x] Carteira do cliente (crédito pré-pago; pagamento por carteira)
- [x] Relatórios (balancete, resultado, receita/dia, recebimentos por forma, ocupação por profissional, comissões)
- [x] Fechamento contábil (trava de período + snapshot do balancete; `/closing`)

## Fase 5 — Recorrência & comercial
- [x] Pacotes (pré-pago) e assinaturas (planos recorrentes com cobrança no ledger)
- [x] Renovação automática de assinaturas (cron `/api/cron/subscriptions`) e consumo/limites por período
- [x] Receita diferida de assinaturas (faturamento em "Receitas a Apropriar", reconhecimento ao fim do período)
- [x] Cupons e promoções (percentual/fixo, validade, limite de uso)
- [x] Notificações por e-mail (caixa de saída + adapter Resend), **agendador
  diário** de lembretes (`/api/cron/daily`) e **registro de push** (tokens Expo
  por usuário/tenant); envio real de push e SMS pendentes

## Fase 6 — Canais
- [x] Website público / agendamento online (`/book`, por subdomínio/slug)
- [x] API v1 para app: login Bearer, agenda da equipe e booking público
- [x] Web mobile solo: navegação inferior, painel “Hoje”, modo solo e onboarding assistido
- [x] App mobile inicial (Expo): login Bearer + agenda + ações de status + booking público + registro de push
- [x] Login do cliente final (OTP por e-mail) e troca de empresa no app
- [ ] Rodar o build EAS (development e produção) e validar push no aparelho —
  config pronta (`mobile/eas.json` + `expo-dev-client`)

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

## Fase 8 — Assistente de IA (concluída)
- [x] Assistente na web (`/assistant`, OpenRouter; padrão Gemini 2.5 Flash):
  perguntas sobre a empresa com resumo somente-leitura (RLS), escrita assistida
  (WhatsApp, respostas, descrições, promoções, legendas), análises (dia, semana,
  clientes inativos, caixa) e **leitura de comprovantes** Pix/cartão com sugestão
  de cobrança (confirmação humana)
- [x] **Modo voz** (Web Speech API): pergunta falada e resposta em voz alta
- [x] Conta demo solo e rate limit próprio (20 solicitações/5 min por usuário)

## Transversal (em todas as fases)
- [x] Onboarding de tenant (cadastro cria empresa + filial + owner)
- [x] CI (lint + typecheck + build no GitHub Actions)
- [x] Testes unitários (vitest) + e2e (Playwright: login demo, minha agenda, histórico do cliente, booking, API v1 pública, assinaturas, fechamento, axe/a11y)
- [x] Observabilidade in-app (logger estruturado, `/api/health`, logs de webhook); métricas e alertas externos (`/api/metrics`, sink HTTP `METRICS_WEBHOOK_URL`, `sendAlert`/`ALERT_WEBHOOK_URL`)
- [x] Segurança (rate limiting no Better Auth, tabela interna `rate_limits`; revisão contínua de policies)
- [x] Acessibilidade (foco visível, skip link, labels/aria, contraste AA, axe e2e). Projeto **somente pt-BR** (sem i18n)
- [x] Migrations versionadas (`drizzle/` + `npm run db:migrate`; sem `drizzle-kit push`) e guarda no CI
- [x] Ambientes separados: demo (branch Neon `production`) e dev (branch `dev`), `APP_ENV` travando login demo e seed (`docs/banco-e-ambientes.md`)
- [x] Trava no banco contra agendamento duplo (`appointments_no_overlap`, migration `0002`)
- [x] Agendador diário de lembretes e envio da caixa de saída (`/api/cron/daily`)
- [x] Recuperação de senha (`/forgot-password` → `/reset-password`, link de 1 h,
  encerra outras sessões) e verificação de e-mail (link no cadastro,
  `/verify-email`, aviso com reenvio no painel; obrigatória só com
  `AUTH_REQUIRE_EMAIL_VERIFICATION=true`)
- [x] Termos de Uso (`/termos`) e Política de Privacidade (`/privacidade`, LGPD):
  aceite obrigatório no cadastro (validado no servidor), histórico em
  `legal_acceptances` (versão, data, IP, navegador) e reaceite em
  `/aceite-termos` quando a versão muda (`LEGAL_VERSIONS` em `src/lib/legal.ts`)
- [x] Billing da plataforma (`/billing`): planos Solo/Equipe/Rede
  (`src/lib/billing/plans.ts`), teste grátis de 14 dias, limites de
  profissionais/filiais/usuários, tolerância de 7 dias e bloqueio do painel;
  Mercado Pago Assinaturas (`BILLING_PROVIDER=mercadopago`) + provedor mock;
  webhook em `/api/billing/webhooks/mercadopago`; demo isenta (cortesia)
- [ ] Validar o billing com credenciais reais do Mercado Pago (sandbox) e
  confirmar preços dos planos
- [ ] Preencher dados da empresa e do encarregado (`LEGAL_COMPANY`) e revisar o
  texto com advogado
- [ ] Provedor de e-mail real (`RESEND_API_KEY` + domínio verificado) e ligar
  `AUTH_REQUIRE_EMAIL_VERIFICATION=true`; enviar também os convites de equipe
- [ ] Storage de arquivos por tenant (logo/imagens; hoje só URL)
- [ ] Conciliação automática de extrato bancário (a manual continua em
  `/reconciliation`)
- [ ] Canais SMS e envio real de push

## Lançamento (pendente; decidido deixar para quando o produto estiver completo)
- [ ] Domínio próprio e subdomínio por tenant
- [ ] Banco de produção limpo (`npm run db:migrate`), sem conta demo (`APP_ENV=production`)
- [ ] Demo em endereço próprio (ex.: `demo.<domínio>`)
- [ ] E-mail real (verificação de conta, convites, lembretes)
- [ ] Credenciais de produção do billing (Mercado Pago) e do assistente
      (`OPENROUTER_API_KEY`), além do gateway ativo (`PAYMENT_PROVIDER`)

### Acabamento público (feito)
- [x] Landing comercial (`/`): recursos, passos, planos lidos de `PLANS`, FAQ e
      CTA de teste grátis (`/login?modo=cadastro`); link "Ver demonstração" por
      `NEXT_PUBLIC_DEMO_URL`
- [x] Páginas de erro (`error.tsx` na raiz e no painel, `global-error.tsx`) e 404
- [x] SEO: `metadataBase`, título com template, Open Graph gerado, ícones,
      `robots.txt` (bloqueia tudo fora de `APP_ENV=production`) e `sitemap.xml`

## Concluído fora das fases
- [x] Gateway de pagamento online (adapter portável: mock + Mercado Pago +
      InfinitePay; Fase 4)
- [x] Billing da própria plataforma (`/billing`): planos Solo/Equipe/Rede, teste
      grátis de 14 dias, limites e bloqueio, provedor mock + Mercado Pago
      Assinaturas e webhook próprio
- [x] LGPD: Termos, Política de Privacidade, aceite registrado e reaceite por
      versão (`LEGAL_VERSIONS`/`LEGAL_COMPANY` em `src/lib/legal.ts`)
- [x] Auth: recuperação de senha e verificação de e-mail (link de 24 h; exigência
      opcional por `AUTH_REQUIRE_EMAIL_VERIFICATION`)
- [x] Modo demonstração somente leitura (`tenants.is_read_only` + trigger no
      banco; `DEMO_READ_ONLY=false` libera em dev/preview)
