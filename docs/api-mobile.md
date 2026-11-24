# API v1 para o app mobile

> Contrato da API versionada para o app do cliente e o app da equipe. Base:
> `https://<seu-dominio>/api/v1`. Todas as respostas são JSON e incluem CORS
> (Bearer não depende de cookie).

## Autenticação

### App da equipe (painel/profissional)

1. `POST /api/v1/auth/login` com `{ "email": "...", "password": "..." }`.
2. A resposta traz `{ token, user }`. Guarde o token no armazenamento seguro do
   aparelho (Keychain/Keystore).
3. Envie `Authorization: Bearer <token>` nas rotas autenticadas.
4. `POST /api/v1/auth/logout` revoga a sessão.

O login é encapsulado no servidor para o app nativo não precisar enviar o header
`Origin` (exigido pelo Better Auth no fluxo web). A sessão web continua usando
cookie normalmente.

### App do cliente final (OTP)

1. `POST /api/v1/client/auth/request` com `{ "email": "..." }` e o tenant em
   `x-tenant-slug` (ou `?tenant=`/subdomínio).
2. O código de **6 dígitos** chega por e-mail (vale 10 min, 5 tentativas).
3. `POST /api/v1/client/auth/verify` com `{ "email": "...", "code": "123456" }`
   devolve `{ token, expiresAt, client, tenant, tenants }`.
4. Envie `Authorization: Bearer <token>` nas rotas `/client/*`.
5. `POST /api/v1/client/auth/logout` revoga a sessão.

O e-mail é a identidade do cliente **dentro do tenant**; cadastros repetidos com
o mesmo e-mail são tratados como o mesmo cliente. A resposta do `request` é
sempre genérica (não revela se o e-mail existe). Em `APP_ENV=dev`/`demo` sem
`RESEND_API_KEY`, a resposta inclui `devCode` para testes.

### Canal público (app do cliente / booking)

Não exige login. O tenant é resolvido por:

- header `x-tenant-slug: demo`, **ou**
- query `?tenant=demo`, **ou**
- subdomínio (`demo.<domínio>`).

Exemplo:

```bash
curl "https://SEU_DOMINIO/api/v1/public/catalog" -H "x-tenant-slug: demo"
```

## Endpoints autenticados

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/me` | Usuário, tenant ativo (inclui `isSolo`), papel, profissional vinculado e lista de tenants |
| `POST` | `/tenant` | Troca o tenant ativo (`{ "tenantId": "..." }`), validando o vínculo |
| `GET` | `/appointments` | Agenda do tenant; filtros `from`, `to`, `status`, `professionalId`, `mine=1`, `limit` |
| `PATCH` | `/appointments/:id/status` | Muda o status; valida transição, janela de cancelamento e gera taxa de no-show |
| `POST` | `/push-tokens` | Registra/atualiza o token Expo Push do aparelho no tenant ativo |
| `DELETE` | `/push-tokens` | Remove o token do usuário atual |
| `POST` | `/auth/login` | Login do app; devolve token de sessão |
| `POST` | `/auth/logout` | Revoga a sessão atual |

`GET /appointments` aceita `from`/`to` em ISO 8601 (padrão: hoje até +7 dias) e
limita a 200 registros. Com `mine=1`, exige que o usuário tenha um profissional
vinculado e filtra a agenda dele.

### Mudança de status

```http
PATCH /api/v1/appointments/<id>/status
Authorization: Bearer <token>
Content-Type: application/json

{ "status": "check_in" }
```

Transições permitidas: `pending → confirmed`, `confirmed → check_in`,
`check_in → checkout`, `checkout → completed`, e `cancelled`/`no_show` a partir
de `pending`/`confirmed` (cancelamento também de `check_in`/`checkout`).
Respostas: `200 { ok, status }`, `409 INVALID_TRANSITION`, `403
CANCELLATION_WINDOW`/`FORBIDDEN`, `404 NOT_FOUND`.

## Endpoints do cliente final

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/client/auth/request` | Envia o código OTP por e-mail |
| `POST` | `/client/auth/verify` | Valida o código e devolve o token Bearer |
| `POST` | `/client/auth/logout` | Revoga a sessão atual |
| `GET` | `/client/me` | Cliente, empresa ativa e empresas do mesmo e-mail |
| `POST` | `/client/tenant` | Troca a empresa (`{ "tenantId": "..." }`) e devolve novo token |
| `GET` | `/client/appointments` | Agenda/histórico do cliente; `from`/`to` opcionais |

`GET /client/appointments` usa por padrão a janela de -30 a +90 dias e devolve
até 100 registros com `branch` (incluindo `timezone`), `professional`,
`service`, `status` e `priceCents`.

### Corpo do request/verify

```json
{ "email": "ana@exemplo.com" }
```

```json
{ "email": "ana@exemplo.com", "code": "123456" }
```

Respostas: `200 { ok, expiresInSeconds, tenant }` no request; `200 { token,
expiresAt, client, tenant, tenants }` no verify. Erros: `INVALID_CODE` (400),
`CODE_EXPIRED` (400), `TOO_MANY_ATTEMPTS` (429), `TENANT_FORBIDDEN` (403).

## Endpoints públicos

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/public/tenant` | Tenant + filiais ativas |
| `GET` | `/public/catalog` | Categorias, serviços (com overrides por filial), profissionais e vínculos |
| `GET` | `/public/availability` | Slots; query `branchId`, `professionalId`, `serviceId`, `date` |
| `POST` | `/public/bookings` | Cria agendamento `pending` e enfileira confirmação/lembrete |

### Corpo do booking

```json
{
  "branchId": "uuid",
  "professionalId": "uuid",
  "serviceId": "uuid",
  "date": "2026-11-10",
  "time": "14:30",
  "name": "Ana",
  "phone": "11999999999",
  "email": "ana@exemplo.com",
  "notes": "primeira vez"
}
```

Respostas: `201` com `{ ok, label, tenant }`; `409 SLOT_TAKEN` se o horário foi
ocupado; `400` para dados inválidos; `429` para excesso de tentativas.

## Formato de erro

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Sessão ausente ou expirada." } }
```

Códigos: `UNAUTHORIZED`, `NO_TENANT`, `TENANT_REQUIRED`, `TENANT_NOT_FOUND`,
`TENANT_FORBIDDEN`, `INVALID_*`, `INVALID_CODE`, `CODE_EXPIRED`,
`TOO_MANY_ATTEMPTS`, `SLOT_TAKEN`, `UNAVAILABLE`, `RATE_LIMITED`,
`INTERNAL_ERROR`.

## CORS

Por padrão a API responde `Access-Control-Allow-Origin: *`, adequado a apps
nativos com Bearer. Para restringir clientes web, defina
`API_ALLOWED_ORIGINS=https://app.exemplo.com,https://admin.exemplo.com`.

## Limites e segurança

- Login: 10 tentativas/min por IP; booking: 10/10min; disponibilidade: 60/min.
- OTP do cliente: request 5/10min por IP e 3/10min por e-mail; verify 15/10min
  por IP e 10/10min por e-mail.
- O app não deve guardar senha: apenas o token, em armazenamento seguro.
- O token dá acesso ao tenant ativo; a troca de tenant é validada contra
  `memberships` e atualiza `profiles.active_tenant_id`.
- **Cliente final**: o código OTP é guardado como HMAC-SHA256 (ligado a
  tenant+e-mail) e o token da sessão como SHA-256; a sessão vale 30 dias e é
  revogada no logout/troca de empresa. O tenant vem do slug/host.
- Rotas públicas nunca aceitam `tenant_id` do corpo; o tenant vem do slug/host.

## App mobile (implementado)

O app Expo fica em [`mobile/`](../mobile/README.md):

- **Login** (`src/app/index.tsx`): alterna entre **Equipe** (e-mail/senha em
  `/auth/login`) e **Cliente** (OTP por e-mail). Cada modo guarda o token em uma
  chave própria no SecureStore (localStorage no web) e limpa a sessão do outro.
- **Agenda da equipe** (`src/app/agenda.tsx`) chama `/me` e `/appointments`;
  mostra Hoje/7 dias, pull-to-refresh, status, profissional, modo solo e preço.
  Os botões Confirmar/Check-in/Checkout/Concluir, Cancelar e Não veio chamam
  `PATCH /appointments/:id/status`.
- **Área do cliente** (`src/app/client.tsx`): `/client/me` e
  `/client/appointments`; mostra os agendamentos, permite **trocar de empresa**
  (`/client/tenant`) quando o e-mail tem cadastro em mais de um tenant e sair.
- **Booking público** (`src/app/book/index.tsx`): sem login, em 4 passos —
  serviço, profissional/filial, data/horário e contato; usa
  `/public/catalog|availability|bookings` com `EXPO_PUBLIC_TENANT_SLUG`.
- **Push**: após o login, o app pede permissão e registra o token Expo em
  `/push-tokens`. No Android, push remoto exige **development build** (não Expo
  Go) e um `projectId` EAS; sem isso o app mostra push como indisponível.
  `mobile/eas.json` (development/preview/production) e `expo-dev-client` já
  estão configurados; falta rodar o build com credenciais FCM/APNs.
- Rodar: `cd mobile && npm install && cp .env.example .env && npm start`.
  Ajuste `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_TENANT_SLUG` e, se houver,
  `EXPO_PUBLIC_EAS_PROJECT_ID`.

## Próximos passos do app

- `npm run eas:init` + `npm run build:dev` e validar push em aparelho físico;
  depois gerar o build de produção.
- Avaliar cancelamento/remarcação pelo próprio cliente na área `/client`.
