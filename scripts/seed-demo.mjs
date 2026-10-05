// Seed de demonstracao: recria os tenants `demo` e `studio-bella` com cenario
// completo e financeiramente consistente (ledger balanceado), incluindo vendas
// de produtos e historico de agendamentos para relatorios.
// Idempotente: apaga e recria apenas esses tenants.
// Rodar: npm run seed:demo

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  onnotice: () => {},
});

const DEMO_SLUG = "demo";
const BELLA_SLUG = "studio-bella";
const CLINICA_SLUG = "clinica-lumina";
const DEMO_EMAIL = process.env.DEMO_EMAIL?.trim() || "demo@glowhub.app";

// ---------- helpers ----------
function spToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekdayOf(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}
function sp(dateStr, time) {
  return new Date(`${dateStr}T${time}:00-03:00`);
}
const money = (v) => Math.round(v * 100);

async function postEntry(tx, { tenantId, description, idem, refType = null, refId = null, occurredAt = new Date(), lines }) {
  const [entry] = await tx`insert into public.journal_entries ${tx({
    tenant_id: tenantId, occurred_at: occurredAt, description,
    reference_type: refType, reference_id: refId, idempotency_key: idem, created_by: null,
  })} returning id`;
  for (const line of lines) {
    await tx`insert into public.journal_lines ${tx({
      tenant_id: tenantId, entry_id: entry.id, account_id: line.accountId,
      direction: line.direction, amount_cents: line.amount,
    })}`;
  }
  return entry.id;
}

const TABLES = [
  "accounting_periods",
  "journal_lines", "journal_entries", "coupon_redemptions", "coupons",
  "wallet_transactions", "package_redemptions", "client_packages",
  "earnings", "payouts", "payments", "charge_items", "charges",
  "subscription_redemptions", "client_subscriptions", "plan_items", "subscription_plans",
  "package_items", "packages", "appointments", "notifications",
  "product_variants", "products",
  "professional_branches", "professional_services", "professional_hours", "professionals",
  "service_branches", "services", "categories",
  "branch_closures", "branch_hours", "branches",
  "invitations", "memberships",
];

async function wipeTenants(slugs) {
  // webhook_events nao tem tenant_id; remove sempre os eventos mock do demo.
  await sql`delete from public.webhook_events where provider = 'mock' and event_id like 'evt_demo_%'`;

  const rows = await sql`select id from public.tenants where slug = any(${slugs})`;
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  console.log("Limpando tenants anteriores...");
  for (const table of TABLES) {
    await sql.unsafe(`delete from public.${table} where tenant_id = any($1)`, [ids]);
  }
  await sql`delete from public.tenants where id = any(${ids})`;
}

const CHART = [
  ["1", "Caixa", "asset", "cash"],
  ["1.1", "Banco", "asset", "bank"],
  ["1.2", "Contas a Receber", "asset", "accounts_receivable"],
  ["2.2", "Comissões a Pagar", "liability", "liability_commission"],
  ["2.3", "Gorjetas a Pagar", "liability", "liability_tip"],
  ["2.4", "Carteira de Clientes", "liability", "liability_wallet"],
  ["2.5", "Pacotes a Resgatar", "liability", "liability_package"],
  ["3.1", "Capital / Resultados", "equity", null],
  ["4.1", "Receita de Serviços", "revenue", "revenue_service"],
  ["4.2", "Receita de Produtos", "revenue", "revenue_product"],
  ["4.3", "Receita de Pacotes", "revenue", "revenue_package"],
  ["4.4", "Receita de Assinaturas", "revenue", "revenue_subscription"],
  ["5.2", "Comissões", "expense", "expense_commission"],
  ["5.4", "Descontos e Estornos", "expense", "expense_discount"],
];

async function seedChart(tx, tenantId) {
  const accounts = {};
  for (const [code, name, type, key] of CHART) {
    const [row] = await tx`insert into public.ledger_accounts ${tx({ tenant_id: tenantId, code, name, type, system_key: key })} returning id`;
    if (key) accounts[key] = row.id;
  }
  return accounts;
}

async function createService(tx, tenantId, categoryId, [name, duration, price, img]) {
  const [row] = await tx`insert into public.services ${tx({
    tenant_id: tenantId, category_id: categoryId, name, duration_minutes: duration,
    price_cents: money(price), image_url: `https://picsum.photos/seed/${img}/600/400`,
    description: `${name} realizado por profissionais especializados.`,
  })} returning id`;
  return row.id;
}

// ------------------------------------------------------------------
// Tenant 1: Encanto Studio (demo) — completo
// ------------------------------------------------------------------
async function seedDemo(tx) {
  const today = spToday();
  const [tenant] = await tx`insert into public.tenants ${tx({ slug: DEMO_SLUG, name: "Encanto Studio (Demo)" })} returning id`;
  const tenantId = tenant.id;
  const accounts = await seedChart(tx, tenantId);

  const [centro] = await tx`insert into public.branches ${tx({ tenant_id: tenantId, slug: "centro", name: "Unidade Centro", address: "Rua das Flores, 100 - Centro", timezone: "America/Sao_Paulo" })} returning id`;
  const [zonaSul] = await tx`insert into public.branches ${tx({ tenant_id: tenantId, slug: "zona-sul", name: "Unidade Zona Sul", address: "Av. Beira-Mar, 500 - Zona Sul", timezone: "America/Sao_Paulo" })} returning id`;

  const cat = {};
  for (const [name, kind] of [["Cabelo", "service"], ["Unhas", "service"], ["Estética", "service"], ["Cosméticos", "product"]]) {
    const [row] = await tx`insert into public.categories ${tx({ tenant_id: tenantId, kind, name })} returning id`;
    cat[name] = row.id;
  }

  const serviceDefs = [
    ["Corte feminino", "Cabelo", 45, 80, "corte"],
    ["Escova", "Cabelo", 45, 70, "escova"],
    ["Coloração", "Cabelo", 120, 220, "coloracao"],
    ["Manicure", "Unhas", 40, 50, "manicure"],
    ["Pedicure", "Unhas", 40, 60, "pedicure"],
    ["Limpeza de pele", "Estética", 60, 180, "pele"],
    ["Design de sobrancelha", "Estética", 30, 45, "sobrancelha"],
    ["Massagem relaxante", "Estética", 60, 160, "massagem"],
  ];
  const services = {};
  for (const def of serviceDefs) {
    services[def[0]] = await createService(tx, tenantId, cat[def[1]], [def[0], def[2], def[3], def[4]]);
  }
  const durationOf = (n) => serviceDefs.find((s) => s[0] === n)[2];
  const priceOf = (n) => money(serviceDefs.find((s) => s[0] === n)[3]);

  // produtos + variacoes
  const productDefs = [
    ["Shampoo profissional", "Cosméticos", [["300ml", 45, 20], ["1L", 90, 8]]],
    ["Máscara de hidratação", "Cosméticos", [["250g", 70, 15]]],
    ["Esmalte gel", "Cosméticos", [["Unidade", 25, 40]]],
  ];
  const variants = {};
  for (const [name, category, vars] of productDefs) {
    const [product] = await tx`insert into public.products ${tx({ tenant_id: tenantId, category_id: cat[category], name, description: `${name} para venda no balcão.`, image_url: `https://picsum.photos/seed/${encodeURIComponent(name)}/600/400` })} returning id`;
    variants[name] = [];
    for (const [vname, price, stock] of vars) {
      const [v] = await tx`insert into public.product_variants ${tx({ tenant_id: tenantId, product_id: product.id, name: vname, sku: `${name.slice(0, 3).toUpperCase()}-${vname}`, price_cents: money(price), stock_quantity: stock })} returning id`;
      variants[name].push({ id: v.id, price: money(price) });
    }
  }

  // profissionais
  const proDefs = [
    ["Ana Souza", 4000, ["Corte feminino", "Escova", "Coloração"], ["centro", "zona-sul"]],
    ["Bruno Lima", 3000, ["Limpeza de pele", "Massagem relaxante", "Design de sobrancelha"], ["centro"]],
    ["Carla Mendes", 5000, ["Manicure", "Pedicure"], ["centro", "zona-sul"]],
  ];
  const branchById = { centro: centro.id, "zona-sul": zonaSul.id };
  const pros = {};
  for (const [name, bp, svcNames, branchSlugs] of proDefs) {
    const [pro] = await tx`insert into public.professionals ${tx({ tenant_id: tenantId, name, commission_bp: bp })} returning id`;
    pros[name] = pro.id;
    for (const s of svcNames) await tx`insert into public.professional_services ${tx({ tenant_id: tenantId, professional_id: pro.id, service_id: services[s] })}`;
    for (const b of branchSlugs) await tx`insert into public.professional_branches ${tx({ tenant_id: tenantId, professional_id: pro.id, branch_id: branchById[b] })}`;
  }

  // horarios
  for (const [branchId, hours] of [
    [centro.id, [[1, "09:00", "12:00"], [1, "13:00", "19:00"], [2, "09:00", "12:00"], [2, "13:00", "19:00"], [3, "09:00", "12:00"], [3, "13:00", "19:00"], [4, "09:00", "12:00"], [4, "13:00", "19:00"], [5, "09:00", "12:00"], [5, "13:00", "19:00"], [6, "09:00", "17:00"]]],
    [zonaSul.id, [[1, "10:00", "20:00"], [2, "10:00", "20:00"], [3, "10:00", "20:00"], [4, "10:00", "20:00"], [5, "10:00", "20:00"], [6, "09:00", "14:00"]]],
  ]) {
    for (const [wd, start, end] of hours) await tx`insert into public.branch_hours ${tx({ tenant_id: tenantId, branch_id: branchId, weekday: wd, start_time: start, end_time: end })}`;
  }
  for (const [proId, hours] of [
    [pros["Bruno Lima"], [[1, "14:00", "20:00"], [3, "14:00", "20:00"], [5, "14:00", "20:00"]]],
    [pros["Carla Mendes"], [[2, "09:00", "18:00"], [3, "09:00", "18:00"], [4, "09:00", "18:00"], [5, "09:00", "18:00"], [6, "09:00", "14:00"]]],
  ]) {
    for (const [wd, start, end] of hours) await tx`insert into public.professional_hours ${tx({ tenant_id: tenantId, professional_id: proId, weekday: wd, start_time: start, end_time: end })}`;
  }
  await tx`insert into public.branch_closures ${tx({ tenant_id: tenantId, branch_id: centro.id, start_date: addDays(today, 7), end_date: addDays(today, 7), reason: "Manutenção elétrica" })}`;

  // clientes
  const clients = {};
  for (const [name, phone, email] of [
    ["Mariana Alves", "11987650001", "mariana@example.com"],
    ["João Pedro", "11987650002", "joao@example.com"],
    ["Beatriz Rocha", "11987650003", "bia@example.com"],
    ["Rafael Nunes", "11987650004", "rafael@example.com"],
    ["Camila Dias", "11987650005", "camila@example.com"],
    ["Lucas Ferreira", "11987650006", null],
  ]) {
    const [c] = await tx`insert into public.clients ${tx({ tenant_id: tenantId, name, phone, email })} returning id`;
    clients[name] = c.id;
  }

  const ctx = { tenantId, accounts, pros, services, clients, branches: branchById, today };

  async function completeAppointment({ days, time, branch = "centro", pro, service, client, pay = true, tip = 0, method = "cash" }) {
    const dateStr = addDays(today, days);
    const startsAt = sp(dateStr, time);
    const price = priceOf(service);
    const endsAt = new Date(startsAt.getTime() + durationOf(service) * 60000);
    const [a] = await tx`insert into public.appointments ${tx({ tenant_id: tenantId, branch_id: ctx.branches[branch], professional_id: pros[pro], service_id: services[service], client_id: clients[client], starts_at: startsAt, ends_at: endsAt, status: "completed", price_cents: price })} returning id`;
    await chargeCompleted({ id: a.id, price, proId: pros[pro], proName: pro, clientId: clients[client], serviceName: service, serviceId: services[service], occurredAt: startsAt }, { pay, tip, method });
  }

  async function chargeCompleted(appt, { pay, tip, method }) {
    const commission = Math.round((appt.price * ({ "Ana Souza": 4000, "Bruno Lima": 3000, "Carla Mendes": 5000 }[appt.proName] || 0)) / 10000);
    const [charge] = await tx`insert into public.charges ${tx({ tenant_id: tenantId, appointment_id: appt.id, client_id: appt.clientId, status: pay ? "paid" : "open", total_cents: appt.price })} returning id`;
    await tx`insert into public.charge_items ${tx({ tenant_id: tenantId, charge_id: charge.id, kind: "service", reference_id: appt.serviceId, description: appt.serviceName, quantity: 1, unit_price_cents: appt.price, total_cents: appt.price })}`;
    const revenueEntry = await postEntry(tx, { tenantId, description: `Cobrança: ${appt.serviceName}`, idem: `demo-charge-${charge.id}`, refType: "charge", refId: charge.id, occurredAt: appt.occurredAt, lines: [
      { accountId: accounts.accounts_receivable, direction: "debit", amount: appt.price },
      { accountId: accounts.revenue_service, direction: "credit", amount: appt.price },
    ] });
    await tx`update public.charges set revenue_entry_id = ${revenueEntry} where id = ${charge.id}`;

    if (commission > 0) {
      const commEntry = await postEntry(tx, { tenantId, description: `Comissão: ${appt.serviceName}`, idem: `demo-commission-${charge.id}`, refType: "charge", refId: charge.id, occurredAt: appt.occurredAt, lines: [
        { accountId: accounts.expense_commission, direction: "debit", amount: commission },
        { accountId: accounts.liability_commission, direction: "credit", amount: commission },
      ] });
      await tx`insert into public.earnings ${tx({ tenant_id: tenantId, professional_id: appt.proId, kind: "commission", amount_cents: commission, status: "pending", reference_type: "charge", reference_id: charge.id, entry_id: commEntry })}`;
    }

    if (pay) {
      const debitAccount = method === "cash" ? accounts.cash : accounts.bank;
      const [payment] = await tx`insert into public.payments ${tx({ tenant_id: tenantId, charge_id: charge.id, method, amount_cents: appt.price, status: "confirmed", idempotency_key: `demo-pay-${charge.id}` })} returning id`;
      const payEntry = await postEntry(tx, { tenantId, description: `Recebimento (${method})`, idem: `demo-payment-${payment.id}`, refType: "payment", refId: payment.id, occurredAt: appt.occurredAt, lines: [
        { accountId: debitAccount, direction: "debit", amount: appt.price + tip },
        { accountId: accounts.accounts_receivable, direction: "credit", amount: appt.price },
        ...(tip > 0 ? [{ accountId: accounts.liability_tip, direction: "credit", amount: tip }] : []),
      ] });
      await tx`update public.payments set entry_id = ${payEntry} where id = ${payment.id}`;
      await tx`update public.charges set status = 'paid', settlement_entry_id = ${payEntry} where id = ${charge.id}`;
      if (tip > 0) {
        await tx`insert into public.earnings ${tx({ tenant_id: tenantId, professional_id: appt.proId, kind: "tip", amount_cents: tip, status: "pending", reference_type: "payment", reference_id: payment.id, entry_id: payEntry })}`;
      }
    }
    return charge.id;
  }

  // historico: ~5 semanas de atendimentos concluidos (para relatorios)
  const cycle = [
    ["Ana Souza", "Corte feminino", "Mariana Alves"],
    ["Carla Mendes", "Manicure", "Beatriz Rocha"],
    ["Bruno Lima", "Limpeza de pele", "João Pedro"],
    ["Ana Souza", "Coloração", "Camila Dias"],
    ["Carla Mendes", "Pedicure", "Rafael Nunes"],
    ["Ana Souza", "Escova", "Lucas Ferreira"],
  ];
  let made = 0;
  for (let i = 0; i < 22; i += 1) {
    const days = -2 - i * 2;
    const dateStr = addDays(today, days);
    if (weekdayOf(dateStr) === 0) continue; // domingo fechado
    const [pro, service, client] = cycle[i % cycle.length];
    await completeAppointment({
      days, time: "10:00", pro, service, client,
      pay: i % 4 !== 0, tip: i % 5 === 0 ? money(10) : 0, method: i % 2 === 0 ? "cash" : "credit",
    });
    made += 1;
  }

  // agenda (hoje/futuro)
  const agenda = [
    [0, "10:00", "centro", "Ana Souza", "Escova", "Mariana Alves", "confirmed"],
    [0, "14:00", "centro", "Carla Mendes", "Pedicure", "Beatriz Rocha", "check_in"],
    [0, "16:30", "zona-sul", "Ana Souza", "Corte feminino", "Rafael Nunes", "confirmed"],
    [1, "09:30", "centro", "Carla Mendes", "Manicure", "Camila Dias", "pending"],
    [1, "11:00", "centro", "Bruno Lima", "Massagem relaxante", "Lucas Ferreira", "pending"],
    [2, "10:00", "zona-sul", "Ana Souza", "Corte feminino", "Mariana Alves", "pending"],
  ];
  for (const [days, time, branch, pro, service, client, status] of agenda) {
    const dateStr = addDays(today, days);
    const startsAt = sp(dateStr, time);
    const price = priceOf(service);
    const endsAt = new Date(startsAt.getTime() + durationOf(service) * 60000);
    await tx`insert into public.appointments ${tx({ tenant_id: tenantId, branch_id: ctx.branches[branch], professional_id: pros[pro], service_id: services[service], client_id: clients[client], starts_at: startsAt, ends_at: endsAt, status, price_cents: price })}`;
  }

  // venda de produtos (charge sem agendamento)
  async function sellProducts({ client, items, pay, method = "cash" }) {
    const total = items.reduce((s, it) => s + it.unit * it.qty, 0);
    const [charge] = await tx`insert into public.charges ${tx({ tenant_id: tenantId, client_id: clients[client], status: pay ? "paid" : "open", total_cents: total })} returning id`;
    for (const it of items) {
      await tx`insert into public.charge_items ${tx({ tenant_id: tenantId, charge_id: charge.id, kind: "product", reference_id: it.variantId, description: it.description, quantity: it.qty, unit_price_cents: it.unit, total_cents: it.unit * it.qty })}`;
    }
    const debit = pay ? (method === "cash" ? accounts.cash : accounts.bank) : accounts.accounts_receivable;
    const entry = await postEntry(tx, { tenantId, description: "Venda de produtos", idem: `demo-product-${charge.id}`, refType: "charge", refId: charge.id, lines: [
      { accountId: debit, direction: "debit", amount: total },
      { accountId: accounts.revenue_product, direction: "credit", amount: total },
    ] });
    await tx`update public.charges set revenue_entry_id = ${entry} where id = ${charge.id}`;
  }
  await sellProducts({ client: "Rafael Nunes", items: [{ variantId: variants["Shampoo profissional"][0].id, description: "Shampoo profissional 300ml", unit: money(45), qty: 2 }], pay: true, method: "credit" });
  await sellProducts({ client: "Beatriz Rocha", items: [{ variantId: variants["Máscara de hidratação"][0].id, description: "Máscara de hidratação 250g", unit: money(70), qty: 1 }], pay: false });

  // gateway mock: pagamento pendente + eventos de webhook (conciliacao)
  {
    const [openCharge] = await tx`select id, total_cents from public.charges where tenant_id = ${tenantId} and status = 'open' order by created_at limit 1`;
    if (openCharge) {
      await tx`insert into public.payments ${tx({ tenant_id: tenantId, charge_id: openCharge.id, method: "pix", amount_cents: Number(openCharge.total_cents), status: "pending", provider: "mock", provider_ref: "mock_pix_0001", idempotency_key: `demo-gw-${openCharge.id}` })}`;
    }
    await tx`insert into public.webhook_events ${tx({ provider: "mock", event_id: "evt_demo_payment_created", payload: tx.json({ type: "payment.created", provider_ref: "mock_pix_0001" }) })}`;
    await tx`insert into public.webhook_events ${tx({ provider: "mock", event_id: "evt_demo_payment_pending", payload: tx.json({ type: "payment.pending", provider_ref: "mock_pix_0001" }) })}`;
  }

  // repasse (Ana)
  {
    const pending = await tx`select kind, amount_cents from public.earnings where tenant_id = ${tenantId} and professional_id = ${pros["Ana Souza"]} and status = 'pending'`;
    const commissionTotal = pending.filter((p) => p.kind === "commission").reduce((s, p) => s + Number(p.amount_cents), 0);
    const tipTotal = pending.filter((p) => p.kind === "tip").reduce((s, p) => s + Number(p.amount_cents), 0);
    const total = commissionTotal + tipTotal;
    if (total > 0) {
      const [payout] = await tx`insert into public.payouts ${tx({ tenant_id: tenantId, professional_id: pros["Ana Souza"], total_cents: total, method: "pix", idempotency_key: `demo-payout-${Date.now()}` })} returning id`;
      const lines = [];
      if (commissionTotal > 0) lines.push({ accountId: accounts.liability_commission, direction: "debit", amount: commissionTotal });
      if (tipTotal > 0) lines.push({ accountId: accounts.liability_tip, direction: "debit", amount: tipTotal });
      lines.push({ accountId: accounts.bank, direction: "credit", amount: total });
      const entry = await postEntry(tx, { tenantId, description: "Repasse ao profissional", idem: `demo-payout-entry-${payout.id}`, refType: "payout", refId: payout.id, lines });
      await tx`update public.payouts set entry_id = ${entry} where id = ${payout.id}`;
      await tx`update public.earnings set status = 'paid', payout_id = ${payout.id} where tenant_id = ${tenantId} and professional_id = ${pros["Ana Souza"]} and status = 'pending'`;
    }
  }

  // carteira
  {
    const [w] = await tx`insert into public.wallet_transactions ${tx({ tenant_id: tenantId, client_id: clients["Lucas Ferreira"], amount_cents: money(200), kind: "topup" })} returning id`;
    const entry = await postEntry(tx, { tenantId, description: "Crédito em carteira", idem: `demo-wallet-${w.id}`, refType: "wallet", refId: w.id, lines: [
      { accountId: accounts.cash, direction: "debit", amount: money(200) },
      { accountId: accounts.liability_wallet, direction: "credit", amount: money(200) },
    ] });
    await tx`update public.wallet_transactions set entry_id = ${entry} where id = ${w.id}`;
  }

  // pacote + resgate
  {
    const [pack5] = await tx`insert into public.packages ${tx({ tenant_id: tenantId, name: "5 Cortes", description: "Cinco cortes femininos com validade de 6 meses.", price_cents: money(350), validity_days: 180 })} returning id`;
    await tx`insert into public.package_items ${tx({ tenant_id: tenantId, package_id: pack5.id, service_id: services["Corte feminino"], quantity: 5 })}`;
    const [sold] = await tx`insert into public.client_packages ${tx({ tenant_id: tenantId, client_id: clients["Mariana Alves"], package_id: pack5.id, price_cents: money(350), status: "active", expires_at: new Date(Date.now() + 180 * 86400000) })} returning id`;
    const entry = await postEntry(tx, { tenantId, description: "Venda de pacote: 5 Cortes", idem: `demo-package-${sold.id}`, refType: "client_package", refId: sold.id, lines: [
      { accountId: accounts.cash, direction: "debit", amount: money(350) },
      { accountId: accounts.liability_package, direction: "credit", amount: money(350) },
    ] });
    await tx`update public.client_packages set entry_id = ${entry} where id = ${sold.id}`;
    const redeemEntry = await postEntry(tx, { tenantId, description: "Resgate de pacote: Corte feminino", idem: `demo-redeem-${sold.id}`, refType: "client_package", refId: sold.id, lines: [
      { accountId: accounts.liability_package, direction: "debit", amount: money(80) },
      { accountId: accounts.revenue_service, direction: "credit", amount: money(80) },
    ] });
    await tx`insert into public.package_redemptions ${tx({ tenant_id: tenantId, client_package_id: sold.id, service_id: services["Corte feminino"], amount_cents: money(80), entry_id: redeemEntry })}`;
  }

  // assinatura
  {
    const [plan] = await tx`insert into public.subscription_plans ${tx({ tenant_id: tenantId, name: "Clube Cabelo", description: "Mensalidade com cortes e escovas.", price_cents: money(180), interval: "month" })} returning id`;
    await tx`insert into public.plan_items ${tx({ tenant_id: tenantId, plan_id: plan.id, service_id: services["Corte feminino"], quantity_per_period: 2 })}`;
    await tx`insert into public.plan_items ${tx({ tenant_id: tenantId, plan_id: plan.id, service_id: services["Escova"], quantity_per_period: 2 })}`;
    // Periodo ja vencido (-5 dias) para demonstrar a cobranca recorrente.
    const subPeriodStart = new Date(Date.now() - 35 * 86400000);
    const subPeriodEnd = new Date(Date.now() - 5 * 86400000);
    const [sub] = await tx`insert into public.client_subscriptions ${tx({ tenant_id: tenantId, client_id: clients["Camila Dias"], plan_id: plan.id, status: "active", price_cents: money(180), current_period_start: subPeriodStart, current_period_end: subPeriodEnd })} returning id`;
    await postEntry(tx, { tenantId, description: "Assinatura: Clube Cabelo", idem: `demo-sub-${sub.id}`, refType: "subscription", refId: sub.id, lines: [
      { accountId: accounts.bank, direction: "debit", amount: money(180) },
      { accountId: accounts.revenue_subscription, direction: "credit", amount: money(180) },
    ] });
    // Consumo dentro do periodo (limite de 2 por servico).
    await tx`insert into public.subscription_redemptions ${tx({ tenant_id: tenantId, subscription_id: sub.id, service_id: services["Corte feminino"], amount_cents: money(80), redeemed_at: new Date(Date.now() - 20 * 86400000) })}`;
    await tx`insert into public.subscription_redemptions ${tx({ tenant_id: tenantId, subscription_id: sub.id, service_id: services["Escova"], amount_cents: money(70), redeemed_at: new Date(Date.now() - 10 * 86400000) })}`;
  }

  // cupons
  await tx`insert into public.coupons ${tx({ tenant_id: tenantId, code: "BEMVINDO10", description: "10% na primeira visita", discount_type: "percent", discount_value: 1000, min_amount_cents: money(50), max_uses: 100 })}`;
  await tx`insert into public.coupons ${tx({ tenant_id: tenantId, code: "CORTE20", description: "R$ 20 de desconto", discount_type: "fixed", discount_value: money(20), min_amount_cents: money(60) })}`;

  // notificacoes
  await tx`insert into public.notifications ${tx({ tenant_id: tenantId, channel: "email", recipient: "mariana@example.com", subject: `Agendamento confirmado - ${addDays(today, 1)} às 10:00`, body: "Olá Mariana, seu agendamento foi confirmado.", status: "sent", sent_at: new Date() })}`;
  await tx`insert into public.notifications ${tx({ tenant_id: tenantId, channel: "email", recipient: "rafael@example.com", subject: "Lembrete de agendamento", body: "Não esqueça do seu horário amanhã.", status: "pending" })}`;

  return { tenantId, made };
}

// ------------------------------------------------------------------
// Tenant 2: Studio Bella (studio-bella) — barbearia, para troca de tenant
// ------------------------------------------------------------------
async function seedBella(tx) {
  const today = spToday();
  const [tenant] = await tx`insert into public.tenants ${tx({ slug: BELLA_SLUG, name: "Studio Bella" })} returning id`;
  const tenantId = tenant.id;
  const accounts = await seedChart(tx, tenantId);

  const [branch] = await tx`insert into public.branches ${tx({ tenant_id: tenantId, slug: "matriz", name: "Studio Bella - Centro", address: "Rua Augusta, 900", timezone: "America/Sao_Paulo" })} returning id`;
  for (const [wd, start, end] of [[1, "09:00", "19:00"], [2, "09:00", "19:00"], [3, "09:00", "19:00"], [4, "09:00", "19:00"], [5, "09:00", "20:00"], [6, "09:00", "17:00"]]) {
    await tx`insert into public.branch_hours ${tx({ tenant_id: tenantId, branch_id: branch.id, weekday: wd, start_time: start, end_time: end })}`;
  }

  const [cat] = await tx`insert into public.categories ${tx({ tenant_id: tenantId, kind: "service", name: "Barbearia" })} returning id`;
  const svcDefs = [
    ["Corte masculino", 30, 60, "corte-m"],
    ["Barba", 30, 45, "barba"],
    ["Corte + barba", 60, 95, "combo"],
  ];
  const services = {};
  for (const [name, dur, price, img] of svcDefs) {
    services[name] = await createService(tx, tenantId, cat.id, [name, dur, price, img]);
  }
  const priceOf = (n) => money(svcDefs.find((s) => s[0] === n)[2]);
  const durOf = (n) => svcDefs.find((s) => s[0] === n)[1];

  const [pro] = await tx`insert into public.professionals ${tx({ tenant_id: tenantId, name: "Diego Martins", commission_bp: 5000 })} returning id`;
  for (const s of Object.values(services)) {
    await tx`insert into public.professional_services ${tx({ tenant_id: tenantId, professional_id: pro.id, service_id: s })}`;
  }
  await tx`insert into public.professional_branches ${tx({ tenant_id: tenantId, professional_id: pro.id, branch_id: branch.id })}`;

  const clients = {};
  for (const [name, phone] of [["Thiago Ramos", "11955550001"], ["André Costa", "11955550002"], ["Felipe Dias", "11955550003"]]) {
    const [c] = await tx`insert into public.clients ${tx({ tenant_id: tenantId, name, phone })} returning id`;
    clients[name] = c.id;
  }

  // 2 atendimentos concluidos com pagamento + 1 futuro
  for (const [days, time, service, client] of [[-6, "10:00", "Corte masculino", "Thiago Ramos"], [-2, "15:00", "Corte + barba", "André Costa"]]) {
    const dateStr = addDays(today, days);
    const startsAt = sp(dateStr, time);
    const price = priceOf(service);
    const endsAt = new Date(startsAt.getTime() + durOf(service) * 60000);
    const [a] = await tx`insert into public.appointments ${tx({ tenant_id: tenantId, branch_id: branch.id, professional_id: pro.id, service_id: services[service], client_id: clients[client], starts_at: startsAt, ends_at: endsAt, status: "completed", price_cents: price })} returning id`;
    const commission = Math.round(price / 2);
    const [charge] = await tx`insert into public.charges ${tx({ tenant_id: tenantId, appointment_id: a.id, client_id: clients[client], status: "paid", total_cents: price })} returning id`;
    await tx`insert into public.charge_items ${tx({ tenant_id: tenantId, charge_id: charge.id, kind: "service", reference_id: services[service], description: service, quantity: 1, unit_price_cents: price, total_cents: price })}`;
    const rev = await postEntry(tx, { tenantId, description: `Cobrança: ${service}`, idem: `bella-charge-${charge.id}`, refType: "charge", refId: charge.id, occurredAt: startsAt, lines: [
      { accountId: accounts.accounts_receivable, direction: "debit", amount: price },
      { accountId: accounts.revenue_service, direction: "credit", amount: price },
    ] });
    await tx`update public.charges set revenue_entry_id = ${rev} where id = ${charge.id}`;
    const comm = await postEntry(tx, { tenantId, description: `Comissão: ${service}`, idem: `bella-commission-${charge.id}`, refType: "charge", refId: charge.id, occurredAt: startsAt, lines: [
      { accountId: accounts.expense_commission, direction: "debit", amount: commission },
      { accountId: accounts.liability_commission, direction: "credit", amount: commission },
    ] });
    await tx`insert into public.earnings ${tx({ tenant_id: tenantId, professional_id: pro.id, kind: "commission", amount_cents: commission, status: "pending", reference_type: "charge", reference_id: charge.id, entry_id: comm })}`;
    const [pay] = await tx`insert into public.payments ${tx({ tenant_id: tenantId, charge_id: charge.id, method: "cash", amount_cents: price, status: "confirmed", idempotency_key: `bella-pay-${charge.id}` })} returning id`;
    const payEntry = await postEntry(tx, { tenantId, description: "Recebimento (cash)", idem: `bella-payment-${pay.id}`, refType: "payment", refId: pay.id, occurredAt: startsAt, lines: [
      { accountId: accounts.cash, direction: "debit", amount: price },
      { accountId: accounts.accounts_receivable, direction: "credit", amount: price },
    ] });
    await tx`update public.payments set entry_id = ${payEntry} where id = ${pay.id}`;
    await tx`update public.charges set settlement_entry_id = ${payEntry} where id = ${charge.id}`;
  }

  const startsAt = sp(addDays(today, 1), "11:00");
  await tx`insert into public.appointments ${tx({ tenant_id: tenantId, branch_id: branch.id, professional_id: pro.id, service_id: services["Barba"], client_id: clients["Felipe Dias"], starts_at: startsAt, ends_at: new Date(startsAt.getTime() + durOf("Barba") * 60000), status: "confirmed", price_cents: priceOf("Barba") })}`;

  return { tenantId };
}

// ------------------------------------------------------------------
// Tenant 3: Clínica Lumina (clinica-lumina) — estética
// ------------------------------------------------------------------
async function seedClinica(tx) {
  const today = spToday();
  const [tenant] = await tx`insert into public.tenants ${tx({ slug: CLINICA_SLUG, name: "Clínica Lumina" })} returning id`;
  const tenantId = tenant.id;
  const accounts = await seedChart(tx, tenantId);

  const [branch] = await tx`insert into public.branches ${tx({ tenant_id: tenantId, slug: "jardins", name: "Clínica Lumina - Jardins", address: "Alameda Santos, 1200 - Jardins", timezone: "America/Sao_Paulo" })} returning id`;
  for (const [wd, start, end] of [[1, "08:00", "18:00"], [2, "08:00", "18:00"], [3, "08:00", "18:00"], [4, "08:00", "18:00"], [5, "08:00", "18:00"], [6, "09:00", "13:00"]]) {
    await tx`insert into public.branch_hours ${tx({ tenant_id: tenantId, branch_id: branch.id, weekday: wd, start_time: start, end_time: end })}`;
  }

  const [cat] = await tx`insert into public.categories ${tx({ tenant_id: tenantId, kind: "service", name: "Estética avançada" })} returning id`;
  const svcDefs = [
    ["Limpeza de pele profunda", 60, 220, "limpeza"],
    ["Peeling de diamante", 50, 280, "peeling"],
    ["Drenagem linfática", 60, 160, "drenagem"],
    ["Massagem modeladora", 60, 190, "modeladora"],
    ["Avaliação facial", 30, 150, "avaliacao"],
  ];
  const services = {};
  for (const [name, dur, price, img] of svcDefs) services[name] = await createService(tx, tenantId, cat.id, [name, dur, price, img]);
  const priceOf = (n) => money(svcDefs.find((s) => s[0] === n)[2]);
  const durOf = (n) => svcDefs.find((s) => s[0] === n)[1];

  const pros = {};
  for (const [name, bp, svcNames] of [
    ["Dra. Paula Reis", 5000, ["Limpeza de pele profunda", "Peeling de diamante", "Avaliação facial"]],
    ["Fernanda Melo", 4000, ["Drenagem linfática", "Massagem modeladora"]],
  ]) {
    const [pro] = await tx`insert into public.professionals ${tx({ tenant_id: tenantId, name, commission_bp: bp })} returning id`;
    pros[name] = pro.id;
    for (const s of svcNames) await tx`insert into public.professional_services ${tx({ tenant_id: tenantId, professional_id: pro.id, service_id: services[s] })}`;
    await tx`insert into public.professional_branches ${tx({ tenant_id: tenantId, professional_id: pro.id, branch_id: branch.id })}`;
  }

  const clients = {};
  for (const [name, phone, email] of [["Helena Prado", "11944440001", "helena@example.com"], ["Sofia Nunes", "11944440002", "sofia@example.com"], ["Paulo Mota", "11944440003", null], ["Renata Lopes", "11944440004", null]]) {
    const [c] = await tx`insert into public.clients ${tx({ tenant_id: tenantId, name, phone, email })} returning id`;
    clients[name] = c.id;
  }

  const commissionBp = { "Dra. Paula Reis": 5000, "Fernanda Melo": 4000 };
  async function complete({ days, time, pro, service, client, pay }) {
    const dateStr = addDays(today, days);
    const startsAt = sp(dateStr, time);
    const price = priceOf(service);
    const endsAt = new Date(startsAt.getTime() + durOf(service) * 60000);
    const [a] = await tx`insert into public.appointments ${tx({ tenant_id: tenantId, branch_id: branch.id, professional_id: pros[pro], service_id: services[service], client_id: clients[client], starts_at: startsAt, ends_at: endsAt, status: "completed", price_cents: price })} returning id`;
    const commission = Math.round((price * commissionBp[pro]) / 10000);
    const [charge] = await tx`insert into public.charges ${tx({ tenant_id: tenantId, appointment_id: a.id, client_id: clients[client], status: pay ? "paid" : "open", total_cents: price })} returning id`;
    await tx`insert into public.charge_items ${tx({ tenant_id: tenantId, charge_id: charge.id, kind: "service", reference_id: services[service], description: service, quantity: 1, unit_price_cents: price, total_cents: price })}`;
    const rev = await postEntry(tx, { tenantId, description: `Cobrança: ${service}`, idem: `lumina-charge-${charge.id}`, refType: "charge", refId: charge.id, occurredAt: startsAt, lines: [
      { accountId: accounts.accounts_receivable, direction: "debit", amount: price },
      { accountId: accounts.revenue_service, direction: "credit", amount: price },
    ] });
    await tx`update public.charges set revenue_entry_id = ${rev} where id = ${charge.id}`;
    const comm = await postEntry(tx, { tenantId, description: `Comissão: ${service}`, idem: `lumina-commission-${charge.id}`, refType: "charge", refId: charge.id, occurredAt: startsAt, lines: [
      { accountId: accounts.expense_commission, direction: "debit", amount: commission },
      { accountId: accounts.liability_commission, direction: "credit", amount: commission },
    ] });
    await tx`insert into public.earnings ${tx({ tenant_id: tenantId, professional_id: pros[pro], kind: "commission", amount_cents: commission, status: "pending", reference_type: "charge", reference_id: charge.id, entry_id: comm })}`;
    if (pay) {
      const [pm] = await tx`insert into public.payments ${tx({ tenant_id: tenantId, charge_id: charge.id, method: "credit", amount_cents: price, status: "confirmed", idempotency_key: `lumina-pay-${charge.id}` })} returning id`;
      const payEntry = await postEntry(tx, { tenantId, description: "Recebimento (credit)", idem: `lumina-payment-${pm.id}`, refType: "payment", refId: pm.id, occurredAt: startsAt, lines: [
        { accountId: accounts.bank, direction: "debit", amount: price },
        { accountId: accounts.accounts_receivable, direction: "credit", amount: price },
      ] });
      await tx`update public.payments set entry_id = ${payEntry} where id = ${pm.id}`;
      await tx`update public.charges set settlement_entry_id = ${payEntry} where id = ${charge.id}`;
    }
  }

  const history = [
    [-12, "10:00", "Dra. Paula Reis", "Limpeza de pele profunda", "Helena Prado", true],
    [-9, "11:00", "Fernanda Melo", "Drenagem linfática", "Sofia Nunes", true],
    [-6, "15:00", "Dra. Paula Reis", "Peeling de diamante", "Renata Lopes", true],
    [-3, "09:00", "Fernanda Melo", "Massagem modeladora", "Paulo Mota", true],
    [-1, "14:00", "Dra. Paula Reis", "Limpeza de pele profunda", "Sofia Nunes", false],
  ];
  for (const [days, time, pro, service, client, pay] of history) {
    const dateStr = addDays(today, days);
    if (weekdayOf(dateStr) === 0) continue;
    await complete({ days, time, pro, service, client, pay });
  }

  // agendamento futuro
  const startsAt = sp(addDays(today, 2), "10:00");
  await tx`insert into public.appointments ${tx({ tenant_id: tenantId, branch_id: branch.id, professional_id: pros["Dra. Paula Reis"], service_id: services["Avaliação facial"], client_id: clients["Helena Prado"], starts_at: startsAt, ends_at: new Date(startsAt.getTime() + durOf("Avaliação facial") * 60000), status: "confirmed", price_cents: priceOf("Avaliação facial") })}`;

  // pacote de limpezas
  const [pack] = await tx`insert into public.packages ${tx({ tenant_id: tenantId, name: "Pacote 4 Limpezas", description: "Quatro limpezas de pele profundas.", price_cents: money(760), validity_days: 240 })} returning id`;
  await tx`insert into public.package_items ${tx({ tenant_id: tenantId, package_id: pack.id, service_id: services["Limpeza de pele profunda"], quantity: 4 })}`;
  const [sold] = await tx`insert into public.client_packages ${tx({ tenant_id: tenantId, client_id: clients["Helena Prado"], package_id: pack.id, price_cents: money(760), status: "active", expires_at: new Date(Date.now() + 240 * 86400000) })} returning id`;
  await postEntry(tx, { tenantId, description: "Venda de pacote: Pacote 4 Limpezas", idem: `lumina-package-${sold.id}`, refType: "client_package", refId: sold.id, lines: [
    { accountId: accounts.bank, direction: "debit", amount: money(760) },
    { accountId: accounts.liability_package, direction: "credit", amount: money(760) },
  ] });

  await tx`insert into public.coupons ${tx({ tenant_id: tenantId, code: "LUMINA15", description: "15% de boas-vindas", discount_type: "percent", discount_value: 1500, min_amount_cents: money(150) })}`;

  return { tenantId };
}

// Vincula a conta demo (se já existir) a um profissional do tenant demo,
// habilitando a visão "Minha agenda". No primeiro login demo, a vinculação
// também é garantida por src/app/(auth)/login/demo-actions.ts.
async function linkDemoAccount(tenantId) {
  const [user] = await sql`
    select id from public."user" where lower(email) = lower(${DEMO_EMAIL}) limit 1
  `;
  if (!user) return null;
  const [pro] = await sql`
    update public.professionals set user_id = ${user.id}
    where id = (
      select id from public.professionals
      where tenant_id = ${tenantId} and user_id is null
      order by created_at
      limit 1
    )
    returning name
  `;
  return pro?.name ?? null;
}

async function main() {
  await wipeTenants([DEMO_SLUG, BELLA_SLUG, CLINICA_SLUG]);

  const demo = await sql.begin((tx) => seedDemo(tx));
  const bella = await sql.begin((tx) => seedBella(tx));
  const clinica = await sql.begin((tx) => seedClinica(tx));

  const linkedProfessional = await linkDemoAccount(demo.tenantId);

  const [counts] = await sql`
    select
      (select count(*) from public.appointments where tenant_id = ${demo.tenantId})::int as demo_appointments,
      (select count(*) from public.charges where tenant_id = ${demo.tenantId})::int as demo_charges,
      (select count(*) from public.journal_entries where tenant_id = ${demo.tenantId})::int as demo_entries,
      (select count(*) from public.appointments where tenant_id = ${bella.tenantId})::int as bella_appointments,
      (select count(*) from public.appointments where tenant_id = ${clinica.tenantId})::int as clinica_appointments
  `;
  const [tb] = await sql`
    select
      coalesce(sum(amount_cents) filter (where direction = 'debit'), 0)::bigint as debits,
      coalesce(sum(amount_cents) filter (where direction = 'credit'), 0)::bigint as credits
    from public.journal_lines where tenant_id in (${demo.tenantId}, ${bella.tenantId}, ${clinica.tenantId})
  `;
  console.log("Seed demo concluído:", counts);
  console.log("Balancete:", tb.debits.toString(), "=", tb.credits.toString(), "->", tb.debits.toString() === tb.credits.toString() ? "OK" : "DESBALANCEADO");
  console.log(
    "Conta demo vinculada a:",
    linkedProfessional ?? "(usuário demo ainda não existe; vínculo será feito no login demo)",
  );
}

try {
  await main();
} catch (error) {
  console.error("Falha no seed demo:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
