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
const email = `smoke_${Date.now()}@example.com`;

try {
  await admin`insert into public."user" (id, name, email, email_verified)
    values (${userId}, 'Smoke Test', ${email}, true)`;
  await admin`insert into public.memberships (tenant_id, user_id, role)
    select id, ${userId}, 'owner' from public.tenants where slug = 'demo'`;

  const withClaims = await app.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
    const branches = await tx`select count(*)::int as n from public.branches`;
    const members = await tx`select role from public.memberships where user_id = ${userId}`;
    return { branches: branches[0].n, role: members[0]?.role ?? null };
  });

  const withoutClaims = await app.begin(async (tx) => {
    const branches = await tx`select count(*)::int as n from public.branches`;
    return branches[0].n;
  });

  console.log("app com claims  ->", JSON.stringify(withClaims));
  console.log("app sem claims  -> branches:", withoutClaims);

  const ok = withClaims.branches >= 2 && withClaims.role === "owner" && withoutClaims === 0;
  console.log(ok ? "SMOKE OK" : "SMOKE FALHOU");
  process.exitCode = ok ? 0 : 1;
} finally {
  await admin`delete from public.memberships where user_id = ${userId}`;
  await admin`delete from public."user" where id = ${userId}`;
  await admin.end();
  await app.end();
}
