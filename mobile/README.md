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

## Rodar

```bash
npm start          # Expo Dev Tools
npm run android    # emulador/dispositivo Android
npm run ios        # macOS
npm run web        # navegador
npm run typecheck  # tsc --noEmit
```

## Telas

- **Login** (`src/app/index.tsx`): e-mail/senha em `/api/v1/auth/login`; token no
  SecureStore (localStorage no web).
- **Agenda** (`src/app/agenda.tsx`): `/api/v1/me` + `/api/v1/appointments`;
  filtros Hoje/7 dias, pull-to-refresh, status do atendimento, modo solo e
  profissional vinculado.

## Próximos passos

- Ações de status (`/api/v1/appointments/:id/status`) — a API ainda é somente
  leitura na agenda.
- Booking público do cliente (`/api/v1/public/*`).
- Push, login do cliente final e troca de tenant no app.
