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

## Telas

- **Login** (`src/app/index.tsx`): e-mail/senha em `/api/v1/auth/login`; token no
  SecureStore (localStorage no web).
- **Agenda** (`src/app/agenda.tsx`): `/api/v1/me` + `/api/v1/appointments`;
  filtros Hoje/7 dias, pull-to-refresh, status do atendimento, modo solo e
  profissional vinculado. Ações: Confirmar, Check-in, Checkout, Concluir,
  Cancelar e Não veio (`PATCH /appointments/:id/status`).
- **Booking público** (`src/app/book/index.tsx`): sem login, em 4 passos —
  serviço, profissional/filial, data/horário e contato; usa
  `/api/v1/public/catalog|availability|bookings` com `EXPO_PUBLIC_TENANT_SLUG`.

## Próximos passos

- Login do cliente final (OTP) e troca de tenant.
- Testar push em aparelho físico/development build e gerar build EAS.
