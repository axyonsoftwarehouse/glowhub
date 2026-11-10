# GlowHub — Documentação

> Base de conhecimento do projeto. Apenas conhecimento de domínio e decisões
> próprias (clean-room): sem código, layout ou assets de terceiros.

## Comece por aqui

| Documento | Conteúdo |
|---|---|
| [`../README.md`](../README.md) | Setup técnico (Neon, migrations, Better Auth) e visão geral |
| [`como-funciona.md`](como-funciona.md) | **Como o código roda**: requisição, RLS, agenda, financeiro, estoque, integrações |
| [`architecture.md`](architecture.md) | Decisões de arquitetura, multi-tenancy, RLS e princípios do financeiro |
| [`relatorio-projeto.md`](relatorio-projeto.md) | Escopo, status atual, backlog priorizado e handoff |

## Referência

| Documento | Conteúdo |
|---|---|
| [`domain.md`](domain.md) | Como negócios de beleza/estética operam (entidades, rotinas, regras) |
| [`roadmap.md`](roadmap.md) | Fases de construção e o que falta para o lançamento |
| [`banco-e-ambientes.md`](banco-e-ambientes.md) | Migrations versionadas, ambientes (demo/dev/production) e `APP_ENV` |
| [`api-mobile.md`](api-mobile.md) | Contrato da API v1 para app mobile (auth, agenda e booking público) |
| [`../mobile/README.md`](../mobile/README.md) | App Expo: como rodar, configurar a API e telas atuais |
| [`neon-migration.md`](neon-migration.md) | Histórico da migração Supabase → Neon + Better Auth |

## Planos e specs

- [`superpowers/specs/`](superpowers/specs/) — designs aprovados.
- [`superpowers/plans/`](superpowers/plans/) — planos de implementação.

## Como trabalhar neste repositório

- **Docs do Next 16**: o `AGENTS.md` aponta para `node_modules/next/dist/docs/`.
  Leia o guia relevante antes de codar (esta versão tem breaking changes).
- **Antes de mudar schema**: edite `src/db/schema/*` (Drizzle), gere a migration
  com `npm run db:generate` e aplique com `npm run db:migrate` (ver
  [`banco-e-ambientes.md`](banco-e-ambientes.md)).
- **Regra de ouro multi-tenant**: toda tabela de domínio tem `tenant_id` + RLS.
  Nunca consulte sem escopo de tenant.
- **Antes de mudar um fluxo**: leia a seção correspondente em
  [`como-funciona.md`](como-funciona.md) (lá estão as partidas contábeis, as
  chaves de idempotência e as armadilhas).
