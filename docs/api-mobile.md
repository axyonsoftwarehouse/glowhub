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
| `POST` | `/auth/login` | Login do app; devolve token de sessão |
| `POST` | `/auth/logout` | Revoga a sessão atual |

`GET /appointments` aceita `from`/`to` em ISO 8601 (padrão: hoje até +7 dias) e
limita a 200 registros. Com `mine=1`, exige que o usuário tenha um profissional
vinculado e filtra a agenda dele.

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

Códigos: `UNAUTHORIZED`, `NO_TENANT`, `TENANT_FORBIDDEN`, `INVALID_*`,
`SLOT_TAKEN`, `UNAVAILABLE`, `RATE_LIMITED`, `INTERNAL_ERROR`.

## CORS

Por padrão a API responde `Access-Control-Allow-Origin: *`, adequado a apps
nativos com Bearer. Para restringir clientes web, defina
`API_ALLOWED_ORIGINS=https://app.exemplo.com,https://admin.exemplo.com`.

## Limites e segurança

- Login: 10 tentativas/min por IP; booking: 10/10min; disponibilidade: 60/min.
- O app não deve guardar senha: apenas o token, em armazenamento seguro.
- O token dá acesso ao tenant ativo; a troca de tenant é validada contra
  `memberships` e atualiza `profiles.active_tenant_id`.
- Rotas públicas nunca aceitam `tenant_id` do corpo; o tenant vem do slug/host.

## Próximos passos do app

- Scaffold Expo/React Native consumindo `/public/catalog`, `/public/availability`
  e `/public/bookings` (fluxo de agendamento).
- App da equipe: login com `/auth/login`, agenda com `/appointments` e mudança de
  status (endpoint `PATCH` ainda a implementar).
- Notificações push (hoje o lembrete é e-mail) e login do cliente final (OTP).
