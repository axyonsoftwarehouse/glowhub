// Smoke da trava contra agendamento duplo (constraint appointments_no_overlap).
// Cria um tenant temporario (conexao admin), testa os casos e apaga tudo.
// Rodar: node --env-file=<arquivo> scripts/smoke-overlap.mjs

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  onnotice: () => {},
});

const suffix = Date.now();
const day = "2030-01-15";
const at = (time) => new Date(`${day}T${time}:00-03:00`);
let tenantId;

// Cada caso roda num savepoint: um erro esperado nao aborta a transacao.
async function attempt(tx, fn) {
  try {
    await tx.savepoint(fn);
    return null;
  } catch (cause) {
    return cause.code ?? String(cause);
  }
}

try {
  const [tenant] = await sql`insert into public.tenants (slug, name)
    values (${`smoke-overlap-${suffix}`}, 'Smoke Overlap') returning id`;
  tenantId = tenant.id;
  const [branch] = await sql`insert into public.branches (tenant_id, slug, name)
    values (${tenantId}, 'centro', 'Centro') returning id`;
  const [proA] = await sql`insert into public.professionals (tenant_id, name)
    values (${tenantId}, 'Pro A') returning id`;
  const [proB] = await sql`insert into public.professionals (tenant_id, name)
    values (${tenantId}, 'Pro B') returning id`;
  const [service] = await sql`insert into public.services (tenant_id, name)
    values (${tenantId}, 'Corte') returning id`;
  const [client] = await sql`insert into public.clients (tenant_id, name)
    values (${tenantId}, 'Cliente') returning id`;

  const book = (tx, professionalId, start, end, status = "pending") =>
    tx`insert into public.appointments ${tx({
      tenant_id: tenantId, branch_id: branch.id, professional_id: professionalId,
      service_id: service.id, client_id: client.id,
      starts_at: at(start), ends_at: at(end), status,
    })} returning id`;

  const failures = await sql.begin(async (tx) => {
    const failed = [];
    const expect = (name, got, want) => {
      if (got !== want) failed.push(`${name}: esperado ${want ?? "sucesso"}, obtido ${got ?? "sucesso"}`);
    };

    const [first] = await book(tx, proA.id, "10:00", "11:00");
    expect("sobreposto mesmo profissional",
      await attempt(tx, (s) => book(s, proA.id, "10:30", "11:30")), "23P01");
    expect("encostado (11:00-12:00)",
      await attempt(tx, (s) => book(s, proA.id, "11:00", "12:00")), null);
    expect("mesmo horário outro profissional",
      await attempt(tx, (s) => book(s, proB.id, "10:00", "11:00")), null);

    await tx`update public.appointments set status = 'cancelled' where id = ${first.id}`;
    // Dentro do horario cancelado e sem tocar o encostado (11:00-12:00).
    expect("sobre um cancelado",
      await attempt(tx, (s) => book(s, proA.id, "10:15", "10:45")), null);
    expect("reabrir o cancelado",
      await attempt(tx, (s) => s`update public.appointments set status = 'pending' where id = ${first.id}`),
      "23P01");

    return failed;
  });

  if (failures.length === 0) {
    console.log("OVERLAP OK");
  } else {
    console.error(`OVERLAP FALHOU\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  }
} finally {
  if (tenantId) {
    await sql`delete from public.appointments where tenant_id = ${tenantId}`;
    await sql`delete from public.tenants where id = ${tenantId}`;
  }
  await sql.end();
}
