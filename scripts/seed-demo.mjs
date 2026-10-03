// Seed de demonstracao: recria o tenant `demo` com um cenario completo e
// financeiramente consistente (ledger balanceado). Idempotente: apaga e recria.
// Rodar: npm run seed:demo   (ou node --env-file=.env.local scripts/seed-demo.mjs)

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  onnotice: () => {},
});

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
function sp(dateStr, time) {
  return new Date(`${dateStr}T${time}:00-03:00`);
}
const money = (v) => Math.round(v * 100);

async function postEntry(tx, { tenantId, description, idem, refType = null, refId = null, occurredAt = new Date(), lines }) {
  const [entry] = await tx`insert into public.journal_entries ${tx({
    tenant_id: tenantId,
    occurred_at: occurredAt,
    description,
    reference_type: refType,
    reference_id: refId,
    idempotency_key: idem,
    created_by: null,
  })} returning id`;
  for (const line of lines) {
    await tx`insert into public.journal_lines ${tx({
      tenant_id: tenantId,
      entry_id: entry.id,
      account_id: line.accountId,
      direction: line.direction,
      amount_cents: line.amount,
    })}`;
  }
  return entry.id;
}

async function wipeDemo() {
  const [existing] = await sql`select id from public.tenants where slug = 'demo'`;
  if (!existing) return;
  const t = existing.id;
  console.log("Limpando dados antigos do tenant demo...");
  for (const table of [
    "journal_lines", "journal_entries", "coupon_redemptions", "coupons",
    "wallet_transactions", "package_redemptions", "client_packages",
    "earnings", "payouts", "payments", "charge_items", "charges",
    "client_subscriptions", "plan_items", "subscription_plans",
    "package_items", "packages", "appointments", "notifications",
    "product_variants", "products",
    "professional_branches", "professional_services", "professional_hours", "professionals",
    "service_branches", "services", "categories",
    "branch_closures", "branch_hours", "branches",
    "invitations", "memberships",
  ]) {
    await sql.unsafe(`delete from public.${table} where tenant_id = $1`, [t]);
  }
  await sql`delete from public.tenants where id = ${t}`;
}

async function main() {
  await wipeDemo();

  const today = spToday();

  const result = await sql.begin(async (tx) => {
    const [tenant] = await tx`insert into public.tenants ${tx({
      slug: "demo",
      name: "Encanto Studio (Demo)",
    })} returning id`;
    const tenantId = tenant.id;

    // ---------- filiais ----------
    const [centro] = await tx`insert into public.branches ${tx({
      tenant_id: tenantId, slug: "centro", name: "Unidade Centro",
      address: "Rua das Flores, 100 - Centro", timezone: "America/Sao_Paulo",
    })} returning id`;
    const [zonaSul] = await tx`insert into public.branches ${tx({
      tenant_id: tenantId, slug: "zona-sul", name: "Unidade Zona Sul",
      address: "Av. Beira-Mar, 500 - Zona Sul", timezone: "America/Sao_Paulo",
    })} returning id`;

    // ---------- plano de contas ----------
    const chart = [
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
    const accounts = {};
    for (const [code, name, type, key] of chart) {
      const [row] = await tx`insert into public.ledger_accounts ${tx({ tenant_id: tenantId, code, name, type, system_key: key })} returning id`;
      if (key) accounts[key] = row.id;
    }

    // ---------- categorias ----------
    const cat = {};
    for (const [name, kind] of [["Cabelo", "service"], ["Unhas", "service"], ["Estética", "service"], ["Cosméticos", "product"]]) {
      const [row] = await tx`insert into public.categories ${tx({ tenant_id: tenantId, kind, name })} returning id`;
      cat[name] = row.id;
    }

    // ---------- servicos ----------
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
    for (const [name, category, duration, price, img] of serviceDefs) {
      const [row] = await tx`insert into public.services ${tx({
        tenant_id: tenantId, category_id: cat[category], name,
        duration_minutes: duration, price_cents: money(price),
        image_url: `https://picsum.photos/seed/${img}/600/400`,
        description: `${name} realizado por profissionais especializados.`,
      })} returning id`;
      services[name] = row.id;
    }
    const durationOf = (name) => serviceDefs.find((s) => s[0] === name)[2];
    const priceOf = (name) => money(serviceDefs.find((s) => s[0] === name)[3]);

    // ---------- produtos + variacoes ----------
    const productDefs = [
      ["Shampoo profissional", "Cosméticos", [["300ml", 45, 20], ["1L", 90, 8]]],
      ["Máscara de hidratação", "Cosméticos", [["250g", 70, 15]]],
      ["Esmalte gel", "Cosméticos", [["Unidade", 25, 40]]],
    ];
    for (const [name, category, variants] of productDefs) {
      const [product] = await tx`insert into public.products ${tx({
        tenant_id: tenantId, category_id: cat[category], name,
        description: `${name} para venda no balcão.`,
        image_url: `https://picsum.photos/seed/${encodeURIComponent(name)}/600/400`,
      })} returning id`;
      for (const [vname, price, stock] of variants) {
        await tx`insert into public.product_variants ${tx({
          tenant_id: tenantId, product_id: product.id, name: vname,
          sku: `${name.slice(0, 3).toUpperCase()}-${vname}`,
          price_cents: money(price), stock_quantity: stock,
        })}`;
      }
    }

    // ---------- profissionais ----------
    const proDefs = [
      ["Ana Souza", 4000, ["Corte feminino", "Escova", "Coloração"], ["Centro", "Zona Sul"]],
      ["Bruno Lima", 3000, ["Limpeza de pele", "Massagem relaxante", "Design de sobrancelha"], ["Centro"]],
      ["Carla Mendes", 5000, ["Manicure", "Pedicure"], ["Centro", "Zona Sul"]],
    ];
    const pros = {};
    for (const [name, bp, svcNames, branchNames] of proDefs) {
      const [pro] = await tx`insert into public.professionals ${tx({ tenant_id: tenantId, name, commission_bp: bp })} returning id`;
      pros[name] = pro.id;
      for (const s of svcNames) {
        await tx`insert into public.professional_services ${tx({ tenant_id: tenantId, professional_id: pro.id, service_id: services[s] })}`;
      }
      for (const b of branchNames) {
        await tx`insert into public.professional_branches ${tx({ tenant_id: tenantId, professional_id: pro.id, branch_id: b === "Centro" ? centro.id : zonaSul.id })}`;
      }
    }

    // ---------- horarios das filiais ----------
    const branchHourDefs = [
      [centro.id, [[1, "09:00", "12:00"], [1, "13:00", "19:00"], [2, "09:00", "12:00"], [2, "13:00", "19:00"], [3, "09:00", "12:00"], [3, "13:00", "19:00"], [4, "09:00", "12:00"], [4, "13:00", "19:00"], [5, "09:00", "12:00"], [5, "13:00", "19:00"], [6, "09:00", "17:00"]]],
      [zonaSul.id, [[1, "10:00", "20:00"], [2, "10:00", "20:00"], [3, "10:00", "20:00"], [4, "10:00", "20:00"], [5, "10:00", "20:00"], [6, "09:00", "14:00"]]],
    ];
    for (const [branchId, hours] of branchHourDefs) {
      for (const [weekday, start, end] of hours) {
        await tx`insert into public.branch_hours ${tx({ tenant_id: tenantId, branch_id: branchId, weekday, start_time: start, end_time: end })}`;
      }
    }

    // ---------- horarios dos profissionais ----------
    const proHourDefs = [
      [pros["Bruno Lima"], [[1, "14:00", "20:00"], [3, "14:00", "20:00"], [5, "14:00", "20:00"]]],
      [pros["Carla Mendes"], [[2, "09:00", "18:00"], [3, "09:00", "18:00"], [4, "09:00", "18:00"], [5, "09:00", "18:00"], [6, "09:00", "14:00"]]],
    ];
    for (const [proId, hours] of proHourDefs) {
      for (const [weekday, start, end] of hours) {
        await tx`insert into public.professional_hours ${tx({ tenant_id: tenantId, professional_id: proId, weekday, start_time: start, end_time: end })}`;
      }
    }

    // ---------- bloqueio ----------
    await tx`insert into public.branch_closures ${tx({ tenant_id: tenantId, branch_id: centro.id, start_date: addDays(today, 7), end_date: addDays(today, 7), reason: "Manutenção elétrica" })}`;

    // ---------- clientes ----------
    const clientDefs = [
      ["Mariana Alves", "11987650001", "mariana@example.com"],
      ["João Pedro", "11987650002", "joao@example.com"],
      ["Beatriz Rocha", "11987650003", "bia@example.com"],
      ["Rafael Nunes", "11987650004", "rafael@example.com"],
      ["Camila Dias", "11987650005", "camila@example.com"],
      ["Lucas Ferreira", "11987650006", null],
    ];
    const clients = {};
    for (const [name, phone, email] of clientDefs) {
      const [c] = await tx`insert into public.clients ${tx({ tenant_id: tenantId, name, phone, email })} returning id`;
      clients[name] = c.id;
    }

    // ---------- agendamentos ----------
    const apptDefs = [
      [-5, "10:00", centro, "Ana Souza", "Corte feminino", "Mariana Alves", "completed"],
      [-5, "11:00", centro, "Carla Mendes", "Manicure", "Beatriz Rocha", "completed"],
      [-3, "15:00", zonaSul, "Ana Souza", "Coloração", "Camila Dias", "completed"],
      [-1, "16:00", centro, "Bruno Lima", "Limpeza de pele", "João Pedro", "completed"],
      [0, "10:00", centro, "Ana Souza", "Escova", "Mariana Alves", "confirmed"],
      [0, "14:00", centro, "Carla Mendes", "Pedicure", "Beatriz Rocha", "check_in"],
      [0, "16:30", zonaSul, "Ana Souza", "Corte feminino", "Rafael Nunes", "confirmed"],
      [1, "09:30", centro, "Carla Mendes", "Manicure", "Camila Dias", "pending"],
      [1, "11:00", centro, "Bruno Lima", "Massagem relaxante", "Lucas Ferreira", "pending"],
      [2, "10:00", zonaSul, "Ana Souza", "Corte feminino", "Mariana Alves", "pending"],
    ];
    const appts = [];
    for (const [days, time, branch, proName, serviceName, clientName, status] of apptDefs) {
      const dateStr = addDays(today, days);
      const startsAt = sp(dateStr, time);
      const duration = durationOf(serviceName);
      const price = priceOf(serviceName);
      const endsAt = new Date(startsAt.getTime() + duration * 60000);
      const [a] = await tx`insert into public.appointments ${tx({
        tenant_id: tenantId, branch_id: branch.id, professional_id: pros[proName],
        service_id: services[serviceName], client_id: clients[clientName],
        starts_at: startsAt, ends_at: endsAt, status, price_cents: price,
      })} returning id`;
      appts.push({ id: a.id, priceCents: price, proId: pros[proName], proName, clientId: clients[clientName], serviceName, serviceId: services[serviceName], occurredAt: startsAt, status });
    }

    // ---------- financeiro por atendimento concluido ----------
    const commissionBp = { "Ana Souza": 4000, "Bruno Lima": 3000, "Carla Mendes": 5000 };
    const completed = appts.filter((a) => a.status === "completed");
    for (const [i, a] of completed.entries()) {
      const commission = Math.round((a.priceCents * commissionBp[a.proName]) / 10000);
      const [charge] = await tx`insert into public.charges ${tx({
        tenant_id: tenantId, appointment_id: a.id, client_id: a.clientId,
        status: i === completed.length - 1 ? "open" : "paid", total_cents: a.priceCents,
      })} returning id`;
      await tx`insert into public.charge_items ${tx({
        tenant_id: tenantId, charge_id: charge.id, kind: "service",
        reference_id: a.serviceId, description: a.serviceName, quantity: 1,
        unit_price_cents: a.priceCents, total_cents: a.priceCents,
      })}`;
      const revenueEntry = await postEntry(tx, {
        tenantId, description: `Cobrança: ${a.serviceName}`, idem: `demo-charge-${charge.id}`,
        refType: "charge", refId: charge.id, occurredAt: a.occurredAt,
        lines: [
          { accountId: accounts.accounts_receivable, direction: "debit", amount: a.priceCents },
          { accountId: accounts.revenue_service, direction: "credit", amount: a.priceCents },
        ],
      });
      await tx`update public.charges set revenue_entry_id = ${revenueEntry} where id = ${charge.id}`;

      if (commission > 0) {
        const commEntry = await postEntry(tx, {
          tenantId, description: `Comissão: ${a.serviceName}`, idem: `demo-commission-${charge.id}`,
          refType: "charge", refId: charge.id, occurredAt: a.occurredAt,
          lines: [
            { accountId: accounts.expense_commission, direction: "debit", amount: commission },
            { accountId: accounts.liability_commission, direction: "credit", amount: commission },
          ],
        });
        await tx`insert into public.earnings ${tx({
          tenant_id: tenantId, professional_id: a.proId, kind: "commission",
          amount_cents: commission, status: "pending", reference_type: "charge",
          reference_id: charge.id, entry_id: commEntry,
        })}`;
      }

      if (i !== completed.length - 1) {
        const tip = i === 0 ? money(15) : 0;
        const method = i % 2 === 0 ? "cash" : "credit";
        const debitAccount = method === "cash" ? accounts.cash : accounts.bank;
        const [payment] = await tx`insert into public.payments ${tx({
          tenant_id: tenantId, charge_id: charge.id, method, amount_cents: a.priceCents,
          status: "confirmed", idempotency_key: `demo-pay-${charge.id}`,
        })} returning id`;
        const payEntry = await postEntry(tx, {
          tenantId, description: `Recebimento (${method})`, idem: `demo-payment-${payment.id}`,
          refType: "payment", refId: payment.id, occurredAt: a.occurredAt,
          lines: [
            { accountId: debitAccount, direction: "debit", amount: a.priceCents + tip },
            { accountId: accounts.accounts_receivable, direction: "credit", amount: a.priceCents },
            ...(tip > 0 ? [{ accountId: accounts.liability_tip, direction: "credit", amount: tip }] : []),
          ],
        });
        await tx`update public.payments set entry_id = ${payEntry} where id = ${payment.id}`;
        await tx`update public.charges set status = 'paid', settlement_entry_id = ${payEntry} where id = ${charge.id}`;
        if (tip > 0) {
          await tx`insert into public.earnings ${tx({
            tenant_id: tenantId, professional_id: a.proId, kind: "tip", amount_cents: tip,
            status: "pending", reference_type: "payment", reference_id: payment.id, entry_id: payEntry,
          })}`;
        }
      }
    }

    // ---------- repasse (Ana) ----------
    {
      const pending = await tx`select kind, amount_cents from public.earnings where tenant_id = ${tenantId} and professional_id = ${pros["Ana Souza"]} and status = 'pending'`;
      const commissionTotal = pending.filter((p) => p.kind === "commission").reduce((s, p) => s + Number(p.amount_cents), 0);
      const tipTotal = pending.filter((p) => p.kind === "tip").reduce((s, p) => s + Number(p.amount_cents), 0);
      const total = commissionTotal + tipTotal;
      if (total > 0) {
        const [payout] = await tx`insert into public.payouts ${tx({
          tenant_id: tenantId, professional_id: pros["Ana Souza"], total_cents: total,
          method: "pix", idempotency_key: `demo-payout-${Date.now()}`,
        })} returning id`;
        const lines = [];
        if (commissionTotal > 0) lines.push({ accountId: accounts.liability_commission, direction: "debit", amount: commissionTotal });
        if (tipTotal > 0) lines.push({ accountId: accounts.liability_tip, direction: "debit", amount: tipTotal });
        lines.push({ accountId: accounts.bank, direction: "credit", amount: total });
        const entry = await postEntry(tx, { tenantId, description: "Repasse ao profissional", idem: `demo-payout-entry-${payout.id}`, refType: "payout", refId: payout.id, lines });
        await tx`update public.payouts set entry_id = ${entry} where id = ${payout.id}`;
        await tx`update public.earnings set status = 'paid', payout_id = ${payout.id} where tenant_id = ${tenantId} and professional_id = ${pros["Ana Souza"]} and status = 'pending'`;
      }
    }

    // ---------- carteira ----------
    {
      const [w] = await tx`insert into public.wallet_transactions ${tx({ tenant_id: tenantId, client_id: clients["Lucas Ferreira"], amount_cents: money(200), kind: "topup" })} returning id`;
      const entry = await postEntry(tx, {
        tenantId, description: "Crédito em carteira", idem: `demo-wallet-${w.id}`, refType: "wallet", refId: w.id,
        lines: [
          { accountId: accounts.cash, direction: "debit", amount: money(200) },
          { accountId: accounts.liability_wallet, direction: "credit", amount: money(200) },
        ],
      });
      await tx`update public.wallet_transactions set entry_id = ${entry} where id = ${w.id}`;
    }

    // ---------- pacote ----------
    {
      const [pack5] = await tx`insert into public.packages ${tx({ tenant_id: tenantId, name: "5 Cortes", description: "Cinco cortes femininos com validade de 6 meses.", price_cents: money(350), validity_days: 180 })} returning id`;
      await tx`insert into public.package_items ${tx({ tenant_id: tenantId, package_id: pack5.id, service_id: services["Corte feminino"], quantity: 5 })}`;
      const [sold] = await tx`insert into public.client_packages ${tx({
        tenant_id: tenantId, client_id: clients["Mariana Alves"], package_id: pack5.id,
        price_cents: money(350), status: "active", expires_at: new Date(Date.now() + 180 * 86400000),
      })} returning id`;
      const entry = await postEntry(tx, {
        tenantId, description: "Venda de pacote: 5 Cortes", idem: `demo-package-${sold.id}`, refType: "client_package", refId: sold.id,
        lines: [
          { accountId: accounts.cash, direction: "debit", amount: money(350) },
          { accountId: accounts.liability_package, direction: "credit", amount: money(350) },
        ],
      });
      await tx`update public.client_packages set entry_id = ${entry} where id = ${sold.id}`;
      const redeemEntry = await postEntry(tx, {
        tenantId, description: "Resgate de pacote: Corte feminino", idem: `demo-redeem-${sold.id}`, refType: "client_package", refId: sold.id,
        lines: [
          { accountId: accounts.liability_package, direction: "debit", amount: money(80) },
          { accountId: accounts.revenue_service, direction: "credit", amount: money(80) },
        ],
      });
      await tx`insert into public.package_redemptions ${tx({ tenant_id: tenantId, client_package_id: sold.id, service_id: services["Corte feminino"], amount_cents: money(80), entry_id: redeemEntry })}`;
    }

    // ---------- assinatura ----------
    {
      const [plan] = await tx`insert into public.subscription_plans ${tx({ tenant_id: tenantId, name: "Clube Cabelo", description: "Mensalidade com cortes e escovas.", price_cents: money(180), interval: "month" })} returning id`;
      await tx`insert into public.plan_items ${tx({ tenant_id: tenantId, plan_id: plan.id, service_id: services["Corte feminino"], quantity_per_period: 2 })}`;
      await tx`insert into public.plan_items ${tx({ tenant_id: tenantId, plan_id: plan.id, service_id: services["Escova"], quantity_per_period: 2 })}`;
      const [sub] = await tx`insert into public.client_subscriptions ${tx({
        tenant_id: tenantId, client_id: clients["Camila Dias"], plan_id: plan.id, status: "active",
        price_cents: money(180), current_period_end: new Date(Date.now() + 30 * 86400000),
      })} returning id`;
      await postEntry(tx, {
        tenantId, description: "Assinatura: Clube Cabelo", idem: `demo-sub-${sub.id}`, refType: "subscription", refId: sub.id,
        lines: [
          { accountId: accounts.bank, direction: "debit", amount: money(180) },
          { accountId: accounts.revenue_subscription, direction: "credit", amount: money(180) },
        ],
      });
    }

    // ---------- cupons ----------
    await tx`insert into public.coupons ${tx({ tenant_id: tenantId, code: "BEMVINDO10", description: "10% na primeira visita", discount_type: "percent", discount_value: 1000, min_amount_cents: money(50), max_uses: 100 })}`;
    await tx`insert into public.coupons ${tx({ tenant_id: tenantId, code: "CORTE20", description: "R$ 20 de desconto", discount_type: "fixed", discount_value: money(20), min_amount_cents: money(60) })}`;

    // ---------- notificacoes ----------
    await tx`insert into public.notifications ${tx({ tenant_id: tenantId, channel: "email", recipient: "mariana@example.com", subject: `Agendamento confirmado - ${addDays(today, 1)} às 10:00`, body: "Olá Mariana, seu agendamento foi confirmado.", status: "sent", sent_at: new Date() })}`;
    await tx`insert into public.notifications ${tx({ tenant_id: tenantId, channel: "email", recipient: "rafael@example.com", subject: "Lembrete de agendamento", body: "Não esqueça do seu horário amanhã.", status: "pending" })}`;

    return { tenantId };
  });

  const [counts] = await sql`
    select
      (select count(*) from public.services where tenant_id = ${result.tenantId})::int as services,
      (select count(*) from public.clients where tenant_id = ${result.tenantId})::int as clients,
      (select count(*) from public.appointments where tenant_id = ${result.tenantId})::int as appointments,
      (select count(*) from public.charges where tenant_id = ${result.tenantId})::int as charges,
      (select count(*) from public.payments where tenant_id = ${result.tenantId})::int as payments,
      (select count(*) from public.journal_entries where tenant_id = ${result.tenantId})::int as entries
  `;
  console.log("Seed demo concluído:", counts);
}

try {
  await main();
} catch (error) {
  console.error("Falha no seed demo:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
