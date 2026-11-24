# GlowHub Mobile (Expo)

App da equipe/solo para acessar a agenda do GlowHub. Consome a **API v1** do
projeto Next (`/api/v1`), com login Bearer e token guardado no SecureStore.

## Requisitos

- Node.js 22+ (o projeto usa Node 24 no CI).
- Expo Go no aparelho, ou um development build.
- A API rodando (`npm run dev` na raiz) e o banco configurado.

## Configuração

```bash
cd mobile
npm install
cp .env.example .env
```

Ajuste `EXPO_PUBLIC_API_URL`:

| Ambiente | URL |
|---|---|
| iOS simulator | `http://localhost:3000` |
| Android emulator | `http://10.0.2.2:3000` |
| Aparelho físico | `http://<IP-da-máquina>:3000` |

O app usa HTTP em desenvolvimento; para produção, use HTTPS.
`EXPO_PUBLIC_TENANT_SLUG` define o salão do booking público (padrão `demo`).

Push: o app registra um token Expo em `/api/v1/push-tokens` quando o
`projectId` EAS está disponível (`npx eas-cli init` grava em `app.json`, ou use
`EXPO_PUBLIC_EAS_PROJECT_ID`). No Android, push remoto exige **development
build**; sem projectId o app segue funcionando e mostra push como indisponível.

## Rodar

```bash
npm start          # Expo Dev Tools
npm run android    # emulador/dispositivo Android
npm run ios        # macOS
npm run web        # navegador
npm run typegen    # gera os tipos das rotas (.expo)
npm run typecheck  # tsc --noEmit
```

## EAS, development build e push

O projeto já tem `eas.json` (perfis `development`, `preview` e `production`) e
`expo-dev-client`. O primeiro build precisa da sua conta Expo:

```bash
npx eas-cli@latest login
npm run eas:init        # cria/associa o projeto e grava extra.eas.projectId
npm run build:dev       # development client (interna)
npm run build:preview   # APK interno para testar sem dev tools
npm run build:prod      # produção (autoIncrement)
```

- **Android push** exige **FCM v1** (projeto Firebase + service account). O
  `eas build` pergunta pelas credenciais e guarda no projeto EAS.
- **iOS push** exige conta paga do Apple Developer; registre o aparelho antes e
  aceite a criação da chave APNs no primeiro build.
- O `projectId` também pode vir de `EXPO_PUBLIC_EAS_PROJECT_ID` (fallback).
- Instale o development build no aparelho, rode `npm start` e abra o app pelo
  development client. Depois do login, o token Expo é enviado para
  `/api/v1/push-tokens`.
- Para testar: use https://expo.dev/notifications com o token do aparelho ou
  crie um agendamento público — o booking dispara “Novo agendamento” via
  `sendPushToTenant`.
- `EXPO_PUBLIC_API_URL` precisa ser alcançável pelo aparelho (IP da máquina na
  rede ou URL publicada). Sem `projectId`, o app segue funcionando e mostra push
  como indisponível.

Os identificadores `com.glowhub.app` (`android.package`/`ios.bundleIdentifier`)
podem ser trocados antes da primeira publicação nas lojas.

## Telas

- **Login** (`src/app/index.tsx`): alterna entre **Equipe** (e-mail/senha em
  `/api/v1/auth/login`) e **Cliente** (OTP de 6 dígitos por e-mail em
  `/api/v1/client/auth/request|verify`). Tokens ficam no SecureStore
  (localStorage no web) em chaves separadas.
- **Agenda da equipe** (`src/app/agenda.tsx`): `/api/v1/me` +
  `/api/v1/appointments`; filtros Hoje/7 dias, pull-to-refresh, status do
  atendimento, modo solo e profissional vinculado. Ações: Confirmar, Check-in,
  Checkout, Concluir, Cancelar e Não veio
  (`PATCH /appointments/:id/status`).
- **Área do cliente** (`src/app/client.tsx`): `/api/v1/client/me` +
  `/api/v1/client/appointments`; lista os agendamentos, troca de empresa
  (`/api/v1/client/tenant`) quando o e-mail tem cadastro em mais de um tenant e
  faz logout.
- **Booking público** (`src/app/book/index.tsx`): sem login, em 4 passos —
  serviço, profissional/filial, data/horário e contato; usa
  `/api/v1/public/catalog|availability|bookings` com `EXPO_PUBLIC_TENANT_SLUG`.

O login do cliente exige um **cadastro de cliente com e-mail** no tenant (o
booking público cria esse cadastro; o e-mail é opcional no booking). No dev/demo,
sem `RESEND_API_KEY`, a tela mostra o `devCode` retornado pela API.

## Próximos passos

- Rodar o build de development, validar push em aparelho físico e gerar o build
  de produção no EAS.
- Avaliar cancelamento/remarcação pelo próprio cliente.
