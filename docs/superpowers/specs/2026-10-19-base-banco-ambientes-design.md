# Base sólida: migrations versionadas e ambientes separados

Data: 2026-10-19 · Status: aguardando aprovação

## Por que

O GlowHub ainda não tem nenhum salão real. O site no ar
(`glowhub-silk.vercel.app`) é usado só internamente, sempre pela conta demo.
O objetivo agora é deixar a base confiável antes de pensar em lançamento,
domínio ou marca.

Hoje existem dois pontos frágeis:

1. **Um banco só.** Desenvolvimento local, testes e2e, `npm run seed:demo` e o
   site no ar escrevem no mesmo banco Neon (`ep-bold-shadow`, branch principal).
2. **O schema evolui sem registro.** `npx drizzle-kit push` aplica a diferença
   entre o código e o banco na hora, e o `db/rls.sql` é reaplicado à mão. Não há
   histórico do que mudou nem garantia de que dois bancos estão iguais. Quando
   houver dados reais, um `push` errado pode apagar colunas com dados.

## Objetivos

- Toda mudança de schema vira um arquivo de migration numerado, versionado no
  git e aplicado do mesmo jeito em qualquer banco.
- Um comando só leva um banco vazio até o estado atual completo (tabelas, RLS,
  funções, triggers, permissões).
- O desenvolvimento local e os testes deixam de tocar no banco usado pelo site
  no ar.
- A conta demo não pode ser ligada por engano num ambiente que não seja demo
  ou dev.

## Fora do escopo (decidido)

- **E-mail real** (verificação, convites, lembretes): fica para quando houver
  domínio.
- **Domínio próprio e subdomínio por tenant**: fica para o lançamento.
- **Banco de produção "de verdade"**: só será criado no lançamento, junto com o
  domínio, usando o `db:migrate` deste trabalho.
- Endereço separado para a demo (ex.: `demo.<domínio>`): só no lançamento.

## Anti-objetivos (seria um fracasso mesmo funcionando)

- Perder ou recriar dados do banco atual (a demo) durante a troca.
- Uma migration inicial que não reproduz o banco real (alguma tabela, índice,
  constraint, policy ou trigger faltando num banco criado do zero).
- Duplicar as 427 linhas do `rls.sql` em cada nova migration.
- Deixar o fluxo mais trabalhoso do que o `push` atual para o dia a dia.

## Desenho

### 1. Migrations versionadas

- Gerar com `drizzle-kit generate` a migration inicial (`drizzle/0000_*.sql`) a
  partir de `src/db/schema`, com `out: "./drizzle"` (já configurado em
  `drizzle.config.ts`).
- Novo script `npm run db:migrate`:
  1. aplica as migrations pendentes com o migrator do `drizzle-orm`, usando
     `DATABASE_URL` (role owner);
  2. em seguida reaplica `db/rls.sql`, que é idempotente.
- O `rls.sql` continua sendo a fonte de verdade de funções, policies, triggers
  e grants, reaplicado depois de cada `db:migrate`. Ele não é copiado para
  dentro das migrations.
- **Baseline do banco atual:** o banco `main` já tem todo o schema. Ele é
  marcado como "já está na 0000" (registro na tabela de controle do migrator),
  sem executar a 0000 nele. Ficar num script (`db:baseline`) ou num passo
  documentado é escolha de quem for implementar, mas precisa ser seguro rodar
  duas vezes.
- **Validação obrigatória da 0000:** num banco vazio, rodar `db:migrate` e
  comparar o schema resultante (`pg_dump --schema-only` ou equivalente) com o do
  `main`. Qualquer diferença tem que ser corrigida antes de fazer o baseline:
  ou no schema Drizzle, ou no `rls.sql`.
- O `rls.sql` hoje não é 100% idempotente (há `do $$` e statements sem
  `if not exists`/`drop ... if exists`). Ele precisa rodar duas vezes seguidas
  no mesmo banco sem erro.
- **Fim do `push`:** remover o `push` das instruções (README, `docs/`,
  relatório) e trocar por `db:generate` + `db:migrate`.
- **Guarda no CI:** um passo no `ci.yml` que roda `drizzle-kit generate` e
  falha se ele gerar arquivo novo, ou seja, se o schema mudou sem migration.
  Não precisa de banco.
- A role `glowhub_app` continua sendo criada à parte (SQL em
  `docs/neon-migration.md`), porque tem senha. O `db:migrate` não cria roles.

- **Quem aplica as migrations (decisão do autor do documento):** por
  enquanto, o desenvolvedor roda `npm run db:migrate` à mão, primeiro no `dev`
  e, depois de validado, no `main`, **antes** de fazer merge em `master` (que
  dispara o deploy). Nem o CI nem a Vercel recebem a `DATABASE_URL` de owner.
  Automatizar isso fica para o lançamento.
- **Banco vazio para validar a 0000 (decisão do autor do documento):** um
  branch Neon temporário (`migration-check`), criado a partir do `main` e
  esvaziado (`drop schema public cascade; create schema public;`). O
  `db:migrate` roda nele, os schemas são comparados e o branch é apagado. A
  criação e a remoção desse branch pedem aprovação na hora.
- **Divergências que a validação encontrar (decisão do autor do documento):**
  a regra é ajustar o schema Drizzle ou o `rls.sql` para reproduzir o `main`,
  nunca alterar o `main` para bater com a 0000. A exceção é a seção 1.1.

### 1.1. Trava contra agendamento duplo (achado durante o desenho)

A documentação (`docs/architecture.md`, `docs/relatorio-projeto.md`) e o
código (`src/app/(app)/appointments/actions.ts` trata o erro `23P01`) contam
com uma *exclusion constraint* em `appointments` que impede dois atendimentos
sobrepostos do mesmo profissional. **Ela não existe no banco `main`** (consulta
a `pg_constraint` em 2026-10-19: nenhuma constraint do tipo `x`), nem no schema
Drizzle, nem no `rls.sql`. Só existe o `create extension btree_gist`. Hoje a
única proteção é a checagem de horários livres na aplicação, que tem condição
de corrida (painel e `/book` ao mesmo tempo).

**Decidido: entra neste trabalho, como a primeira migration nova (`0001`),
depois do baseline.** Ela também serve de prova de que o fluxo novo funciona de
ponta a ponta.

- Regra: o mesmo `professional_id` não pode ter dois atendimentos com
  intervalos `[starts_at, ends_at)` sobrepostos, **ignorando** os status
  `cancelled` e `no_show` (um horário cancelado volta a ficar livre). Na prática:
  `exclude using gist (professional_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status not in ('cancelled','no_show'))`.
  O intervalo semiaberto permite atendimentos encostados (um termina às 10h e
  o outro começa às 10h).
- Antes de aplicar em cada banco (`dev` e depois `main`), rodar uma consulta
  que lista as sobreposições existentes. Se houver alguma nos dados demo, ela é
  resolvida corrigindo os dados (pelo seed, ou cancelando o atendimento
  duplicado) e nunca afrouxando a regra. No `main`, qualquer correção de dado
  precisa da aprovação do responsável.
- Se possível, a constraint fica no schema Drizzle. Se o Drizzle não conseguir
  expressá-la, ela fica numa migration SQL customizada (`drizzle-kit generate
  --custom`). Ela **não** vai para o `rls.sql`.
- O tratamento do erro `23P01` que já existe em
  `src/app/(app)/appointments/actions.ts` passa a valer. Verificar se as outras
  rotas que criam ou remarcam atendimentos (`/book`, `/my-schedule`, mudança
  de status) também traduzem esse erro para uma mensagem amigável.
- Adicionar um teste (smoke script ou e2e) que tenta criar dois atendimentos
  sobrepostos e confirma que o segundo é recusado.
- Corrigir `docs/architecture.md` e `docs/relatorio-projeto.md`, que hoje dizem
  que a constraint fica no `rls.sql`.

### 2. Ambientes separados

| Ambiente | Banco (branch Neon) | Usado por | Conta demo |
|---|---|---|---|
| **demo** | `main` (o banco atual, com os dados atuais) | `glowhub-silk.vercel.app` (Vercel Production) | ligada |
| **dev** | `dev` (novo branch Neon a partir do `main`) | local (`.env.local`), e2e (local e workflow manual), Vercel Preview | ligada |
| **production** | ainda não existe | criado no lançamento | desligada |

- Criar o branch `dev` no Neon a partir do `main`. Os branches do Neon herdam
  as roles, então a `glowhub_app` já existe nele. As connection strings mudam
  porque o endpoint é outro.
- Apontar `.env.local`, os secrets `E2E_*` do workflow `e2e.yml` e as variáveis
  do ambiente **Preview** da Vercel para o branch `dev`. O ambiente
  **Production** da Vercel continua no `main`.
- **Reset do dev:** documentar como resetar o branch `dev` a partir do `main`
  (o "reset from parent" do Neon) e depois rodar `npm run seed:demo`.

### 3. Trava da conta demo por ambiente

- Nova variável `APP_ENV` com os valores `demo`, `dev` ou `production`.
- O login demo (`src/app/(auth)/login/demo-actions.ts` e o botão em
  `login/page.tsx`) só funciona com `APP_ENV` igual a `demo` ou `dev`, **além**
  das condições atuais (`NEXT_PUBLIC_DEMO_LOGIN=true` e `DEMO_PASSWORD`
  definido). Com `APP_ENV` ausente, o padrão é o mais seguro: tratar como
  `production`, com a demo desligada.
- `scripts/seed-demo.mjs` apaga e recria os tenants demo, e no `main` esses
  tenants são praticamente todos os dados. Por isso (decisão do autor do
  documento): com `APP_ENV=dev` ele roda normalmente; com `APP_ENV=demo` só
  roda com uma confirmação explícita (ex.: flag `--confirm-demo`), para um
  reseed deliberado da vitrine; com qualquer outro valor ou sem `APP_ENV`, ele
  recusa. O script `seed:demo` continua lendo o `.env.local` (dev). Um reseed
  do `main` é um comando à parte e documentado.
- Definir `APP_ENV` na Vercel (Production = `demo`, Preview = `dev`), no
  `.env.local` (`dev`), no `e2e.yml` (`dev`) e no `.env.example`.
- O comportamento de somente leitura da demo (`DEMO_READ_ONLY`) não muda.

### 4. Documentação

- Atualizar `README.md`, `docs/relatorio-projeto.md` (setup e handoff) e
  `docs/roadmap.md` com: o fluxo de migrations, a tabela de ambientes, o reset
  do dev e o que fica para o lançamento.

## Restrições

- Next.js 16, Drizzle 0.45 / drizzle-kit 0.31, Neon, Vercel (o projeto já usa
  tudo isso).
- Mudanças de configuração em serviços externos (criar o branch Neon, trocar
  variáveis na Vercel e nos secrets do GitHub) precisam da aprovação do
  responsável pelo projeto no momento de cada uma.
- O banco `main` tem os dados da demo, usados nas demonstrações internas.
  Nenhum passo pode apagá-los.

## Deixado para quem for construir

- A forma exata do baseline (script ou passo manual documentado).
- Como comparar os schemas na validação da 0000.
- Os nomes finais dos scripts npm (`db:generate`, `db:migrate`, `db:baseline`
  são sugestões).
- Como deixar o `rls.sql` idempotente.
