# Base sólida (migrations + ambientes) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o `drizzle-kit push` por migrations versionadas, separar o banco de desenvolvimento do banco da demo, travar a conta demo por `APP_ENV` e adicionar a trava contra agendamento duplo como migration `0001`.

**Architecture:** Migrations do Drizzle em `drizzle/` aplicadas por um script próprio (`scripts/migrate.mjs`), que roda o migrator do `drizzle-orm` e depois reaplica o `db/rls.sql`, que é idempotente. O banco atual (`main`) recebe um *baseline* em vez de executar a `0000`. Um branch Neon `dev` passa a atender o desenvolvimento local, o e2e e o Vercel Preview. A conta demo e o seed passam a depender de `APP_ENV`.

**Tech Stack:** Next.js 16, Drizzle ORM 0.45 / drizzle-kit 0.31, `postgres` (postgres-js), Neon, Vercel, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-19-base-banco-ambientes-design.md`

## Global Constraints

- O banco `main` (endpoint `ep-bold-shadow-…`) tem os dados da demo, e nenhum passo pode apagá-los.
- Mudanças em serviços externos (criar ou apagar branch Neon, variáveis da Vercel, secrets do GitHub) **param e pedem aprovação** ao usuário no momento de cada uma (passos marcados com ⛔).
- Toda alteração no `main` (baseline, `db:migrate`, correção de dado) também é ⛔.
- Nem o CI nem a Vercel recebem a `DATABASE_URL` de owner. As migrations são aplicadas à mão: primeiro `dev`, depois `main`, **antes** do merge em `master`.
- `APP_ENV` ∈ {`demo`, `dev`, `production`}. Se ausente ou inválido, vale `production` (demo desligada).
- Regra de sobreposição: mesmo `professional_id`, `tstzrange(starts_at, ends_at, '[)')` sobrepostos, ignorando `status in ('cancelled','no_show')`.
- A trava de agendamento fica numa migration (custom SQL) e **não** no `rls.sql`.
- O `rls.sql` não é copiado para dentro das migrations.
- Projeto somente pt-BR: mensagens ao usuário em português.
- Trabalhar numa branch nova criada a partir de `origin/master` (`chore/migrations-ambientes`). A branch local `feat/bi-relatorios-fidelizacao` já foi mergeada.

## Review Focus

1. **`APP_ENV` ausente na Vercel Production no momento do merge:** a conta demo some do site. A variável precisa estar definida (`demo`) antes do merge, e isso é verificado no site depois do deploy (Task 8).
2. **`db:migrate` rodado num banco que já tem tabelas mas não tem baseline:** a `0000` tentaria recriar tudo. O script precisa recusar com uma mensagem clara (teste na Task 3).
3. **Reabrir um atendimento cancelado num horário que já foi ocupado** (mudança de status em `/appointments` e `/my-schedule`): o esperado é uma mensagem amigável, nunca erro 500 (Task 6).
4. **Atendimentos encostados** (10:00–11:00 e 11:00–12:00 com o mesmo profissional): têm que continuar permitidos (smoke da Task 6).
5. **`rls.sql` aplicado duas vezes seguidas** no mesmo banco: não pode dar erro (verificação da Task 3).

---

### Task 1: `APP_ENV` — trava da conta demo e do seed

**Files:**
- Create: `src/lib/app-env.ts`, `src/lib/app-env.test.ts`
- Create: `scripts/lib/seed-guard.mjs`, `scripts/lib/seed-guard.test.mjs`
- Modify: `src/app/(auth)/login/demo-actions.ts:69-80` (guard), `src/app/(auth)/login/page.tsx:39` (botão)
- Modify: `scripts/seed-demo.mjs` (chamar o guard antes de conectar)
- Modify: `vitest.config.mts` (incluir `scripts/**/*.test.mjs`)
- Modify: `.env.example` (documentar `APP_ENV`), `.github/workflows/e2e.yml` (`APP_ENV: dev`)

**Interfaces:**
- Produces: `type AppEnv = "demo" | "dev" | "production"`; `getAppEnv(env?: Record<string,string|undefined>): AppEnv`; `isDemoLoginEnabled(env?): boolean` (true só se `getAppEnv` ∈ {demo, dev} **e** `NEXT_PUBLIC_DEMO_LOGIN === "true"` **e** `DEMO_PASSWORD` não vazio).
- Produces: `assertSeedAllowed(appEnv: string | undefined, argv: string[]): void` em `scripts/lib/seed-guard.mjs`. Lança `Error` com mensagem em pt-BR quando não pode rodar.

- [ ] **Step 0: Criar a branch e commitar o spec**

```bash
git fetch origin && git switch -c chore/migrations-ambientes origin/master
git add docs/superpowers && git commit -m "Docs: design e plano de migrations versionadas e ambientes"
```

- [ ] **Step 1: Testes que falham**

`src/lib/app-env.test.ts`:
- `getAppEnv({})` → `"production"`; `getAppEnv({APP_ENV:"demo"})` → `"demo"`; `getAppEnv({APP_ENV:"DEV"})` → `"production"` (sem normalização: só valores exatos); `getAppEnv({APP_ENV:"staging"})` → `"production"`.
- `isDemoLoginEnabled({APP_ENV:"demo", NEXT_PUBLIC_DEMO_LOGIN:"true", DEMO_PASSWORD:"x"})` → `true`; o mesmo com `APP_ENV:"production"` → `false`; sem `APP_ENV` → `false`; `DEMO_PASSWORD:""` → `false`; `NEXT_PUBLIC_DEMO_LOGIN:"false"` → `false`.

`scripts/lib/seed-guard.test.mjs`:
- `assertSeedAllowed("dev", [])` não lança.
- `assertSeedAllowed("demo", [])` lança, com mensagem contendo `--confirm-demo`.
- `assertSeedAllowed("demo", ["--confirm-demo"])` não lança.
- `assertSeedAllowed(undefined, ["--confirm-demo"])` lança; `assertSeedAllowed("production", ["--confirm-demo"])` lança.

- [ ] **Step 2:** `npx vitest run src/lib/app-env.test.ts scripts/lib/seed-guard.test.mjs`. Esperado: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar** os dois módulos. Em `demo-actions.ts`, trocar a checagem atual por `if (!isDemoLoginEnabled()) return …` (mantendo a mensagem atual). Em `login/page.tsx`, renderizar `<DemoLoginButton />` só se `isDemoLoginEnabled()`. Em `seed-demo.mjs`, logo após os imports, chamar `assertSeedAllowed(process.env.APP_ENV, process.argv.slice(2))` dentro de um try que imprime a mensagem e faz `process.exit(1)`. Adicionar `APP_ENV=dev` em `e2e.yml` e um bloco comentado em `.env.example` explicando os três valores e o padrão.

- [ ] **Step 4:** `npm test && npx tsc --noEmit && npm run lint`. Esperado: tudo verde.

- [ ] **Step 5: Verificação local.** Adicionar `APP_ENV=demo` ao `.env.local`, porque ele ainda aponta para o `main` (a Task 4 troca para `dev`). `npm run dev`, abrir `/login` e ver o botão demo. Sem `APP_ENV`, o botão some. `npm run seed:demo` termina com código 1 e a mensagem pedindo `--confirm-demo`. **Não** passar a flag: isso recriaria os dados do `main`.

- [ ] **Step 6: Commit** — `git commit -m "Demo: login demo e seed travados por APP_ENV"`.

---

### Task 2: Snapshot de schema (ferramenta de comparação)

Não há `pg_dump` nesta máquina. A comparação é feita por um script que lê o catálogo do Postgres.

**Files:**
- Create: `scripts/schema-snapshot.mjs`

**Interfaces:**
- Produces: `node --env-file=<env> scripts/schema-snapshot.mjs > arquivo.txt`. Imprime em stdout um texto **ordenado e determinístico** do schema `public`: tabelas e colunas (tipo, nullable, default), constraints (`pg_get_constraintdef`), índices (`pg_get_indexdef`), policies (nome, tabela, cmd, `qual`, `with_check`), triggers (`pg_get_triggerdef`, sem os internos), funções (`pg_get_functiondef`), enums (valores na ordem), extensões, `relrowsecurity` por tabela, e grants de tabela para `glowhub_app` (`information_schema.role_table_grants`). Usa `DATABASE_URL`. Só leitura.
- Nomes gerados automaticamente que podem divergir sem importância (ex.: sufixos `_fkey`, `_pkey`) aparecem como estão. Normalizar só o que a Task 3 mostrar que precisa ser normalizado.

- [ ] **Step 1:** Implementar o script. Cada seção começa com `## <seção>` e as linhas são ordenadas com `localeCompare`.
- [ ] **Step 2:** Rodar duas vezes contra o `main` atual (`.env.local`) e conferir que as saídas são idênticas: `node --env-file=.env.local scripts/schema-snapshot.mjs > a.txt; … > b.txt; git diff --no-index a.txt b.txt`. Esperado: sem diferença. Salvar uma cópia como `main-before.txt` no scratchpad (fora do repo).
- [ ] **Step 3: Commit** — `git commit -m "DB: script de snapshot de schema para comparar bancos"`.

---

### Task 3: Migration `0000` + `db:migrate` + validação num banco vazio

**Files:**
- Create: `drizzle/0000_*.sql`, `drizzle/meta/*` (gerados)
- Create: `scripts/migrate.mjs`
- Modify: `package.json` (scripts `db:generate`, `db:migrate`)
- Modify (se a validação mostrar divergência): `src/db/schema/*.ts` e/ou `db/rls.sql`

**Interfaces:**
- Produces: `npm run db:generate` = `drizzle-kit generate`.
- Produces: `npm run db:migrate` = `node --env-file=.env.local scripts/migrate.mjs`, e `node --env-file=<outro> scripts/migrate.mjs` para outros bancos. O script:
  1. conecta com `DATABASE_URL` (`postgres`, `max: 1`) e imprime o host do endpoint (sem senha), para quem roda saber em qual banco está;
  2. **recusa** (exit 1, mensagem "Banco já tem tabelas mas não tem baseline. Rode `npm run db:baseline`.") se existir `public.tenants` e **não** existir `drizzle.__drizzle_migrations`;
  3. roda `migrate(drizzle(sql), { migrationsFolder: "./drizzle" })` de `drizzle-orm/postgres-js/migrator`;
  4. aplica `db/rls.sql` (mesma lógica de `scripts/apply-sql.mjs`);
  5. imprime as migrations aplicadas.

- [ ] **Step 1:** `npm run db:generate`. Conferir que nasceu um único `drizzle/0000_*.sql` e que ele contém `create table "appointments"`, os enums e as FKs.
- [ ] **Step 2:** Implementar `scripts/migrate.mjs` e os scripts npm.
- [ ] **Step 3: ⛔ Pedir aprovação** para criar o branch Neon temporário `migration-check` a partir do `main` (pelo console Neon ou `npx neonctl branches create --name migration-check --parent main`), e obter as connection strings de owner e de `glowhub_app` (as roles são herdadas). Gravar num `.env.migration-check` **não versionado** (o `.gitignore` já ignora `.env*`), com `APP_ENV=dev`.
- [ ] **Step 4:** Esvaziar o branch temporário: `drop schema public cascade; create schema public; grant usage on schema public to glowhub_app;` e `drop schema if exists drizzle cascade;` (via `apply-sql.mjs` com um arquivo SQL temporário no scratchpad). Conferir que o host impresso **não** é o `ep-bold-shadow`.
- [ ] **Step 5:** `node --env-file=.env.migration-check scripts/migrate.mjs`. Esperado: `0000` aplicada e `rls.sql` aplicado sem erro.
- [ ] **Step 6 (Review Focus 5):** Rodar `node --env-file=.env.migration-check scripts/apply-sql.mjs db/rls.sql` mais uma vez. Esperado: sem erro. Se der erro, tornar o statement idempotente no `rls.sql` (`drop … if exists` antes de `create`, ou `create or replace`).
- [ ] **Step 7:** Snapshot do branch temporário e diff com `main-before.txt`. Esperado: nenhuma diferença (o schema `drizzle` não entra no snapshot, que só cobre `public`). Para cada divergência, ajustar o schema Drizzle ou o `rls.sql` para reproduzir o `main` (nunca o contrário), regenerar a `0000` (apagar `drizzle/` e rodar `db:generate` de novo: ela ainda não foi aplicada em nenhum banco real), esvaziar o branch e repetir os Steps 4–7.
- [ ] **Step 8 (Review Focus 2):** Contra o `main` (`.env.local`, só leitura nesse caso), rodar `npm run db:migrate`. Esperado: recusa com a mensagem de baseline, exit 1, sem alterar nada.
- [ ] **Step 9:** `npm test && npx tsc --noEmit && npm run lint && npm run build`.
- [ ] **Step 10: Commit** — `git commit -m "DB: migrations versionadas (0000) e script db:migrate"`. Manter o branch `migration-check` até a Task 6 (ele é reaproveitado lá) e apagá-lo no fim da Task 6 (⛔).

---

### Task 4: Baseline e branch `dev`

**Files:**
- Create: `scripts/baseline.mjs`
- Modify: `package.json` (script `db:baseline`)

**Interfaces:**
- Consumes: `drizzle/meta/_journal.json` e `drizzle/0000_*.sql` (Task 3).
- Produces: `npm run db:baseline` (e `node --env-file=<x> scripts/baseline.mjs`). O script cria `drizzle.__drizzle_migrations` (`id serial primary key, hash text not null, created_at bigint`) se não existir e insere a `0000` como aplicada. `hash` = sha256 hex do conteúdo do arquivo `.sql`; `created_at` = `when` da entrada 0 do journal (é o formato que o migrator do `drizzle-orm` 0.45 usa: confirmar lendo `node_modules/drizzle-orm/pg-core/dialect.js`, `migrate()`). Idempotente: se já existir uma linha com esse `created_at`, não insere de novo. Recusa se `public.tenants` não existir ("banco vazio: use db:migrate"). Imprime o host.

- [ ] **Step 1:** Implementar o script.
- [ ] **Step 2: ⛔ Pedir aprovação** para criar o branch Neon `dev` a partir do `main` e obter as connection strings (owner e `glowhub_app`, com `-pooler`, igual às atuais).
- [ ] **Step 3:** Trocar `DATABASE_URL` e `DATABASE_AUTHENTICATED_URL` no `.env.local` para o `dev` (guardar as do `main` num `.env.main` não versionado, com `APP_ENV=demo`). Conferir que `APP_ENV=dev` está no `.env.local`.
- [ ] **Step 4:** No `dev`: `npm run db:baseline`, rodar de novo (esperado: "já aplicada", sem duplicar) e depois `npm run db:migrate` (esperado: nenhuma migration pendente, `rls.sql` aplicado).
- [ ] **Step 5:** No `dev`: `npm run seed:demo` (esperado: sucesso), `node --env-file=.env.local scripts/smoke-rls.mjs` e `…/smoke-ledger.mjs` (esperado: OK). `npm run dev` e login demo funcionando.
- [ ] **Step 6: ⛔ Pedir aprovação** e, no `main`: `node --env-file=.env.main scripts/baseline.mjs`, depois `node --env-file=.env.main scripts/migrate.mjs`. Esperado: nada pendente. Snapshot do `main` igual ao `main-before.txt`.
- [ ] **Step 7: Commit** — `git commit -m "DB: baseline de bancos existentes (db:baseline)"`.

---

### Task 5: Guarda no CI (schema mudou sem migration)

**Files:**
- Modify: `.github/workflows/ci.yml` (novo passo depois de `Install`)

- [ ] **Step 1:** Adicionar o passo `Migrations em dia`: `npx drizzle-kit generate` seguido de `git status --porcelain drizzle` e falha com a mensagem "Schema mudou sem migration: rode npm run db:generate e commite." se houver saída. O `drizzle-kit generate` não conecta no banco.
- [ ] **Step 2:** Prova local: adicionar uma coluna temporária em `src/db/schema/infra.ts`, rodar os dois comandos do passo e ver a saída não vazia. Reverter a coluna e apagar a migration gerada. Rodar de novo: saída vazia.
- [ ] **Step 3: Commit** — `git commit -m "CI: falha quando o schema muda sem migration"`.

---

### Task 6: Migration `0001` — trava contra agendamento duplo

**Files:**
- Create: `scripts/check-overlaps.mjs`
- Create: `drizzle/0001_appointments_no_overlap.sql` (via `npx drizzle-kit generate --custom --name=appointments_no_overlap`)
- Create: `scripts/smoke-overlap.mjs`
- Modify: `src/app/(app)/appointments/actions.ts` (update de status: tratar `23P01`)
- Modify: `src/app/(app)/my-schedule/actions.ts` (update de status: tratar `23P01`)
- Modify: `docs/architecture.md:76,248`, `docs/relatorio-projeto.md:127` (onde diz que a constraint fica no `rls.sql`)

**Interfaces:**
- Produces: `scripts/check-overlaps.mjs`, só leitura. Lista os pares (tenant slug, profissional, ids, horários, status) que violariam a regra e sai com 0 se não houver nenhum e 1 se houver.
- Produces: constraint `appointments_no_overlap` em `public.appointments`:
  `exclude using gist (professional_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status not in ('cancelled', 'no_show'))`.
- Mensagem amigável para `23P01` nas mudanças de status: `"Já existe um agendamento nesse horário para o profissional."` (a mesma da criação).

- [ ] **Step 1:** Implementar `check-overlaps.mjs` e rodar no `dev` e no `main` (só leitura). Se houver sobreposições, **parar e mostrar ao usuário** a lista e a proposta de correção (ajustar `seed-demo.mjs` para o `dev`; para o `main`, cancelar o duplicado: ⛔).
- [ ] **Step 2:** Gerar a migration custom e escrever `create extension if not exists btree_gist;` seguido do `alter table … add constraint appointments_no_overlap …`. A extensão tem que estar na migration: num banco vazio, as migrations rodam **antes** do `rls.sql`, que é onde a extensão é criada hoje.
- [ ] **Step 3: Smoke que falha (no `migration-check`, já com a `0000`):** `scripts/smoke-overlap.mjs` usa a conexão admin, cria um tenant/filial/profissional/serviço/cliente temporários (sufixo `Date.now()`) e verifica:
  - um 2º atendimento 10:30–11:30 sobre um 10:00–11:00 do mesmo profissional falha com `code === "23P01"`;
  - 11:00–12:00 (encostado) é aceito (**Review Focus 4**);
  - o mesmo horário com **outro** profissional é aceito;
  - depois de marcar o 10:00–11:00 como `cancelled`, o 10:30–11:30 é aceito;
  - voltar o cancelado para `pending` falha com `23P01` (**Review Focus 3**, no banco).
  
  Limpa tudo no `finally` e imprime `OK` ou o primeiro caso que falhou (exit 1). Rodar antes da migration: esperado FAIL no primeiro caso.
- [ ] **Step 4:** `node --env-file=.env.migration-check scripts/migrate.mjs` (aplica a `0001`) e rodar o smoke de novo. Esperado: `OK`. Depois, esvaziar o branch (Task 3, Step 4) e rodar o `migrate.mjs` do zero, para provar que `0000` + `0001` + `rls.sql` funcionam num banco vazio.
- [ ] **Step 5 (Review Focus 3, na app):** nos dois `update(appointments).set({ status })`, tratar `23P01` no `catch` com a mensagem acima, seguindo o padrão `errorCode(cause) === "23P01"` que já existe em `appointments/actions.ts`. `npx tsc --noEmit && npm run lint && npm test`.
- [ ] **Step 6:** Aplicar no `dev` (`npm run db:migrate`), rodar `smoke-overlap.mjs` no `dev` (esperado `OK`), `npm run seed:demo` (esperado: sem violação) e testar à mão em `/appointments`: tentar marcar dois atendimentos no mesmo horário mostra a mensagem amigável.
- [ ] **Step 7: ⛔ Pedir aprovação**, rodar `check-overlaps.mjs` no `main` de novo e depois `node --env-file=.env.main scripts/migrate.mjs`. Esperado: `0001` aplicada.
- [ ] **Step 8: ⛔ Pedir aprovação** para apagar o branch `migration-check`. Apagar o `.env.migration-check`.
- [ ] **Step 9:** Corrigir os trechos dos docs. Commit — `git commit -m "Agenda: trava no banco contra agendamento duplo (migration 0001)"`.

---

### Task 7: Documentação dos ambientes e do fluxo novo

**Files:**
- Modify: `README.md` (seção de configuração), `docs/relatorio-projeto.md` (2.6, 2.7, 2.8, 6), `docs/roadmap.md` (Transversal), `docs/neon-migration.md` (passos com `push`)

- [ ] **Step 1:** Trocar todas as instruções de `drizzle-kit push` + `apply-sql rls.sql` por `npm run db:generate` (depois de mudar o schema) e `npm run db:migrate`. Verificar com `grep -rn "drizzle-kit push" README.md docs/ db/`: esperado nenhuma ocorrência fora de contexto histórico. Atualizar o comentário do topo do `db/rls.sql` ("Aplique DEPOIS de … push") e do `db/seed.sql`.
- [ ] **Step 2:** Adicionar a tabela de ambientes do spec (demo/`main`, dev/`dev`, production/futuro), o `APP_ENV`, quem roda migrations e quando (dev → main → merge), como resetar o `dev` ("Reset from parent" no Neon + `npm run seed:demo`) e o reseed deliberado da demo (`node --env-file=.env.main scripts/seed-demo.mjs --confirm-demo`).
- [ ] **Step 3:** No roadmap e no relatório, registrar o que ficou para o lançamento: banco de produção, domínio, demo em endereço próprio e e-mail.
- [ ] **Step 4: Commit** — `git commit -m "Docs: fluxo de migrations e ambientes (demo/dev/production)"`.

---

### Task 8: Variáveis externas, e2e e merge

- [ ] **Step 1: ⛔ Pedir aprovação** e, na Vercel (projeto `glowhub`): Production com `APP_ENV=demo`; Preview com `APP_ENV=dev`, `DATABASE_URL`/`DATABASE_AUTHENTICATED_URL` do `dev` e `NEXT_PUBLIC_DEMO_LOGIN=true`/`DEMO_PASSWORD` (se o Preview já não tiver). Production continua no `main`.
- [ ] **Step 2: ⛔ Pedir aprovação** e atualizar os secrets `E2E_DATABASE_URL` e `E2E_DATABASE_AUTHENTICATED_URL` do GitHub para o `dev` (`gh secret set`).
- [ ] **Step 3:** `npm run test:e2e` local (contra o `dev`). Esperado: todos verdes.
- [ ] **Step 4:** Push da branch e abertura do PR para `master` (com a aprovação do usuário para o push e o PR). CI verde, incluindo o passo novo.
- [ ] **Step 5 (Review Focus 1):** Antes do merge, confirmar com o usuário que o Step 1 está feito. Depois do merge e do deploy, abrir `https://glowhub-silk.vercel.app/login`, ver o botão demo, entrar e abrir `/appointments`.
