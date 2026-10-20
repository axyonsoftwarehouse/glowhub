// Lista agendamentos sobrepostos do mesmo profissional (so leitura): os pares
// que violariam a constraint appointments_no_overlap (migration 0002).
// Sai com 0 se nao houver nenhum e 1 se houver.
// Rodar: node --env-file=<arquivo> scripts/check-overlaps.mjs

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL nao definido.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

try {
  console.log(`Banco: ${new URL(url).host}`);
  const rows = await sql`
    select t.slug, p.name as professional,
      a.id as a_id, a.starts_at as a_start, a.ends_at as a_end, a.status as a_status,
      b.id as b_id, b.starts_at as b_start, b.ends_at as b_end, b.status as b_status
    from public.appointments a
    join public.appointments b
      on b.professional_id = a.professional_id
     and a.id < b.id
     and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)')
    join public.tenants t on t.id = a.tenant_id
    join public.professionals p on p.id = a.professional_id
    where a.status not in ('cancelled', 'no_show')
      and b.status not in ('cancelled', 'no_show')
    order by t.slug, p.name, a.starts_at`;
  if (rows.length === 0) {
    console.log("Nenhuma sobreposição.");
  } else {
    console.table(rows);
    console.error(`${rows.length} sobreposição(ões) encontrada(s).`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
