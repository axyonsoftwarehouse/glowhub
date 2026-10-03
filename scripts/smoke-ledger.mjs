import { randomUUID } from "node:crypto";
import postgres from "postgres";

const admin = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  onnotice: () => {},
});
const app = postgres(process.env.DATABASE_AUTHENTICATED_URL, {
  prepare: false,
  max: 1,
  onnotice: () => {},
});

const userId = randomUUID();
const email = `ledger_${Date.now()}@example.com`;
let tenantId;
const accountIds = [];

const withClaims = (fn) =>
  app.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    return fn(tx);
  });

try {
  await admin`insert into public."user" (id, name, email, email_verified)
    values (${userId}, 'Ledger Test', ${email}, true)`;
  const [tenant] = await admin`select id from public.tenants where slug = 'demo'`;
  tenantId = tenant.id;
  await admin`insert into public.memberships (tenant_id, user_id, role)
    values (${tenantId}, ${userId}, 'owner')`;

  for (const [code, name, type] of [
    ["9.1", "Conta Teste A", "asset"],
    ["9.2", "Conta Teste B", "revenue"],
  ]) {
    const [row] = await admin`insert into public.ledger_accounts (tenant_id, code, name, type)
      values (${tenantId}, ${code}, ${name}, ${type})
      on conflict (tenant_id, code) do update set name = excluded.name
      returning id`;
    accountIds.push(row.id);
  }
  const [accA, accB] = accountIds;

  await withClaims(async (tx) => {
    const [e] = await tx`insert into public.journal_entries
      (tenant_id, description, idempotency_key, created_by)
      values (${tenantId}, 'Teste balanceado', ${randomUUID()}, ${userId}) returning id`;
    await tx`insert into public.journal_lines
      (tenant_id, entry_id, account_id, direction, amount_cents)
      values (${tenantId}, ${e.id}, ${accA}, 'debit', 10000),
             (${tenantId}, ${e.id}, ${accB}, 'credit', 10000)`;
  });
  console.log("insert balanceado: OK");

  let unbalancedRejected = false;
  try {
    await withClaims(async (tx) => {
      const [e] = await tx`insert into public.journal_entries
        (tenant_id, description, idempotency_key, created_by)
        values (${tenantId}, 'Teste desbalanceado', ${randomUUID()}, ${userId}) returning id`;
      await tx`insert into public.journal_lines
        (tenant_id, entry_id, account_id, direction, amount_cents)
        values (${tenantId}, ${e.id}, ${accA}, 'debit', 10000),
               (${tenantId}, ${e.id}, ${accB}, 'credit', 5000)`;
    });
  } catch (err) {
    unbalancedRejected = String(err).includes("not balanced");
  }
  console.log("desbalanceado rejeitado:", unbalancedRejected);

  let updateBlocked = false;
  try {
    await withClaims(async (tx) => {
      await tx`update public.journal_lines set amount_cents = 1 where account_id = ${accA}`;
    });
  } catch (err) {
    updateBlocked = /append-only|permission denied/i.test(String(err));
  }
  console.log("update bloqueado:", updateBlocked);

  const [sum] = await withClaims(
    (tx) => tx`select coalesce(sum(amount_cents), 0)::bigint as total
      from public.journal_lines where account_id = ${accA} and direction = 'debit'`,
  );
  console.log("debitos conta A:", sum.total);

  const ok = unbalancedRejected && updateBlocked && Number(sum.total) >= 10000;
  console.log(ok ? "LEDGER OK" : "LEDGER FALHOU");
  process.exitCode = ok ? 0 : 1;
} finally {
  if (tenantId) {
    if (accountIds.length) {
      await admin`delete from public.journal_lines where account_id = any(${accountIds})`;
    }
    await admin`delete from public.journal_entries e
      where e.tenant_id = ${tenantId}
        and not exists (select 1 from public.journal_lines l where l.entry_id = e.id)`;
    if (accountIds.length) {
      await admin`delete from public.ledger_accounts where id = any(${accountIds})`;
    }
    await admin`delete from public.memberships where user_id = ${userId}`;
  }
  await admin`delete from public."user" where id = ${userId}`;
  await admin.end();
  await app.end();
}
