# GlowHub — Documentação

> Base de conhecimento do projeto. Apenas conhecimento de domínio e decisões
> próprias (clean-room): sem código, layout ou assets de terceiros.

| Documento | Conteúdo |
|---|---|
| [`domain.md`](domain.md) | Como negócios de beleza/estética operam (entidades, rotinas, regras) |
| [`architecture.md`](architecture.md) | Stack, multi-tenancy, RLS e princípios do financeiro |
| [`roadmap.md`](roadmap.md) | Fases de construção |
| [`../README.md`](../README.md) | Setup técnico (Supabase, migrations, hook de JWT) |

## Como trabalhar neste repositório
- **Docs do Next 16**: o `AGENTS.md` aponta para `node_modules/next/dist/docs/`.
  Leia o guia relevante antes de codar (esta versão tem breaking changes).
- **Antes de mudar schema**: edite `src/db/schema/*` (Drizzle) **e** a migration
  em `supabase/migrations/` — o SQL é a fonte de verdade do banco.
- **Regra de ouro multi-tenant**: toda tabela de domínio tem `tenant_id` + RLS.
  Nunca consulte sem escopo de tenant.
