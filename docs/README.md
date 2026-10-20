# GlowHub — Documentação

> Base de conhecimento do projeto. Apenas conhecimento de domínio e decisões
> próprias (clean-room): sem código, layout ou assets de terceiros.

| Documento | Conteúdo |
|---|---|
| [`domain.md`](domain.md) | Como negócios de beleza/estética operam (entidades, rotinas, regras) |
| [`architecture.md`](architecture.md) | Stack, multi-tenancy, RLS e princípios do financeiro |
| [`roadmap.md`](roadmap.md) | Fases de construção |
| [`banco-e-ambientes.md`](banco-e-ambientes.md) | Migrations versionadas, ambientes (demo/dev/production) e `APP_ENV` |
| [`../README.md`](../README.md) | Setup técnico (Neon, migrations, Better Auth) |

## Como trabalhar neste repositório
- **Docs do Next 16**: o `AGENTS.md` aponta para `node_modules/next/dist/docs/`.
  Leia o guia relevante antes de codar (esta versão tem breaking changes).
- **Antes de mudar schema**: edite `src/db/schema/*` (Drizzle), gere a migration
  com `npm run db:generate` e aplique com `npm run db:migrate` (ver
  [`banco-e-ambientes.md`](banco-e-ambientes.md)).
- **Regra de ouro multi-tenant**: toda tabela de domínio tem `tenant_id` + RLS.
  Nunca consulte sem escopo de tenant.
