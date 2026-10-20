# Banco de dados e ambientes

Como o schema evolui (migrations versionadas) e qual banco cada ambiente usa.

## Ambientes

| Ambiente | `APP_ENV` | Banco (branch Neon, projeto `GlowHub`) | Usado por | Conta demo |
|---|---|---|---|---|
| **demo** | `demo` | `production` (o branch padrão; endpoint `ep-bold-shadow-…`) | `glowhub-silk.vercel.app` (Vercel Production) | ligada |
| **dev** | `dev` | `dev` (endpoint `ep-cool-tree-…`) | local (`.env.local`), e2e (local e workflow `e2e.yml`), Vercel Preview | ligada |
| **production** | `production` | ainda não existe | será criado no lançamento | desligada |

- Hoje o site no ar **é a demo**: não há salões reais. O branch Neon chamado
  `production` guarda os dados da vitrine.
- `APP_ENV` ausente ou com valor desconhecido vale `production`: o login demo
  fica desligado e o `seed:demo` se recusa a rodar (`src/lib/app-env.ts`,
  `scripts/lib/seed-guard.mjs`).
- O login demo exige **as três** condições: `APP_ENV` igual a `demo` ou `dev`,
  `NEXT_PUBLIC_DEMO_LOGIN=true` e `DEMO_PASSWORD` definido.

### Para o lançamento (fora do escopo atual)
- Criar um banco de produção limpo (`npm run db:migrate` num branch ou projeto
  vazio) e apontar a Vercel Production para ele, com `APP_ENV=production`.
- Mover a demo para um endereço próprio (ex.: `demo.<domínio>`), junto com o
  domínio próprio e o e-mail real.

## Migrations

O schema Drizzle (`src/db/schema`) é a fonte de verdade das tabelas. Cada
mudança vira um arquivo numerado em `drizzle/`, versionado no git.
`db/rls.sql` (funções, triggers, policies e grants) é idempotente e é
reaplicado inteiro depois das migrations.

| Comando | O que faz |
|---|---|
| `npm run db:generate` | Gera a migration a partir da diferença entre o schema e `drizzle/meta`. Não conecta no banco. |
| `npm run db:migrate` | Aplica as migrations pendentes e depois o `db/rls.sql` (`scripts/migrate.mjs`). |
| `npm run db:baseline` | Marca a `0000` como aplicada num banco que já tinha o schema (`scripts/baseline.mjs`). Só é preciso uma vez por banco antigo. |

Os scripts `npm run db:*` usam o `.env.local` (dev). Para outro banco, use
`node --env-file=<arquivo> scripts/migrate.mjs`. Os scripts imprimem o host do
banco antes de agir.

**Não use `drizzle-kit push`.** Ele altera o banco sem deixar registro.

### Fluxo para mudar o schema
1. Edite `src/db/schema/*.ts`.
2. `npm run db:generate` e revise o SQL gerado em `drizzle/`.
   - Constraints que o Drizzle não expressa (ex.: *exclusion constraint*):
     `npx drizzle-kit generate --custom --name=<nome>` e escreva o SQL.
   - Policies, funções, triggers e grants vão no `db/rls.sql`, não nas
     migrations.
3. `npm run db:migrate` (aplica no **dev**) e teste.
4. Commite a migration junto com o schema. O CI falha se o schema mudar sem
   migration (passo "Migrations em dia" em `.github/workflows/ci.yml`).
5. **Antes do merge em `master`** (que faz o deploy da demo), aplique no banco da
   demo: `node --env-file=.env.main scripts/migrate.mjs`. As migrations são
   aplicadas à mão; nem o CI nem a Vercel têm a credencial de owner.

### Checklist antes do merge em `master`
O merge dispara o deploy da demo (`glowhub-silk.vercel.app`). Antes dele:

- [ ] Migrations aplicadas no banco da demo
      (`node --env-file=.env.main scripts/migrate.mjs`, com `scripts/baseline.mjs`
      antes, se for a primeira vez nesse banco).
- [ ] Vercel com `APP_ENV`: **Production** = `demo`, **Preview** = `dev`. Sem
      `APP_ENV`, o app assume `production` e o botão da conta demo some. A Vercel
      lê as variáveis no build, então mudar uma variável depois do deploy exige
      um redeploy.
- [ ] Depois do deploy: abrir `/login` no site, ver o botão "Entrar com conta
      demo" e entrar.

`.env.main` é um arquivo local, não versionado, com as connection strings do
branch `production` e `APP_ENV=demo`.

### Histórico das migrations
- `0000_baseline`: o schema que já estava aplicado no banco da demo antes das
  migrations (schema do commit `6730a63`).
- `0001_bi_estoque_fidelizacao`: tabelas e colunas de BI, estoque e
  fidelização, que faltavam no banco da demo.
- `0002_appointments_no_overlap`: trava no banco contra agendamento duplo do
  mesmo profissional.

## Banco do zero
Num banco vazio (com a role `glowhub_app` criada, ver `docs/neon-migration.md`):

```bash
npm run db:migrate                                          # 0000..N + rls.sql
node --env-file=.env.local scripts/apply-sql.mjs db/seed.sql  # tenant/filial mínimo
npm run seed:demo                                           # cenário demo (APP_ENV=dev)
```

## Resetar o dev
1. No Console do Neon: branch `dev` → **Reset from parent** (copia o estado
   atual do `production`). Ou pelo CLI:
   `npx neonctl branches reset dev --parent --project-id morning-resonance-67800692`.
2. `npm run db:migrate`, para aplicar migrations que ainda não estão no
   `production`.
3. `npm run seed:demo`.

## Reseed da vitrine (demo)
O seed apaga e recria os tenants demo, que no banco da demo são praticamente
todos os dados. Só rode de propósito:

```bash
node --env-file=.env.main scripts/seed-demo.mjs --confirm-demo
```

## Verificações úteis
- `node --env-file=<arquivo> scripts/schema-snapshot.mjs > a.txt`: retrato
  ordenado do schema `public`. Compare dois bancos com `git diff --no-index`.
- `scripts/check-overlaps.mjs`: lista agendamentos sobrepostos (só leitura).
- `scripts/smoke-rls.mjs`, `scripts/smoke-ledger.mjs`, `scripts/smoke-overlap.mjs`.
