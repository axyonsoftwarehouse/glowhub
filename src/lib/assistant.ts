import {
  and,
  asc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  notInArray,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  appointments,
  branchHours,
  branches,
  charges,
  clients,
  payments,
  professionals,
  services,
} from "@/db/schema";
import { addDays } from "@/lib/availability-data";
import { withUser, type AppTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { formatCentsBRL, parsePriceToCents } from "@/lib/money";
import { zonedDateKey, zonedTimeToUtc } from "@/lib/timezone";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantTenant = {
  id: string;
  name: string;
  isSolo: boolean;
};

export type WritingKind =
  | "whatsapp"
  | "description"
  | "promotion"
  | "reply"
  | "instagram";

export type WritingTone =
  | "simples"
  | "acolhedor"
  | "profissional"
  | "divertido";

export type WritingRequest = {
  kind: WritingKind;
  tone: WritingTone;
  context: string;
  audience?: string;
};

export type AnalysisKind = "today" | "week" | "inactive" | "cash";

export type ReceiptMethod =
  | "pix"
  | "credit"
  | "debit"
  | "cash"
  | "transfer"
  | "other";

export type ReceiptConfidence = "alta" | "media" | "baixa";

export type ReceiptData = {
  amountCents: number | null;
  date: string | null;
  payer: string | null;
  method: ReceiptMethod | null;
  reference: string | null;
  confidence: ReceiptConfidence;
  notes: string | null;
};

export type ReceiptCandidate = {
  id: string;
  clientName: string | null;
  description: string;
  totalCents: number;
  createdAt: string;
};

export type ReceiptAnalysis = {
  isReceipt: boolean;
  receipt: ReceiptData;
  candidates: ReceiptCandidate[];
};

export function isAssistantConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function assistantModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
}

type BusinessContext = {
  timezone: string;
  today: string;
  tenantName: string;
  isSolo: boolean;
  branches: { name: string; address: string | null }[];
  todayAppointments: {
    time: string;
    client: string;
    professional: string;
    service: string;
    status: string;
    priceCents: number;
  }[];
  upcomingCount: number;
  services: { name: string; durationMinutes: number; priceCents: number }[];
  clientCount: number;
  paidTodayCents: number;
  openTotalCents: number;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "aguardando confirmação",
  confirmed: "confirmado",
  check_in: "cliente chegou",
  checkout: "em atendimento",
  completed: "concluído",
  cancelled: "cancelado",
  no_show: "não compareceu",
};

function dateFormatter(timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: timezone,
  });
}

type BranchContext = {
  primaryBranchId: string | null;
  timezone: string;
  today: string;
  start: Date;
  end: Date;
};

async function getBranchContext(
  tx: AppTx,
  tenantId: string,
): Promise<BranchContext> {
  const rows = await tx
    .select({
      id: branches.id,
      timezone: branches.timezone,
      isActive: branches.isActive,
    })
    .from(branches)
    .where(eq(branches.tenantId, tenantId))
    .orderBy(asc(branches.name));

  const primary = rows.find((branch) => branch.isActive) ?? rows[0];
  const timezone = primary?.timezone ?? "America/Sao_Paulo";
  const today = zonedDateKey(new Date().toISOString(), timezone);

  return {
    primaryBranchId: primary?.id ?? null,
    timezone,
    today,
    start: zonedTimeToUtc(today, "00:00", timezone),
    end: zonedTimeToUtc(addDays(today, 1), "00:00", timezone),
  };
}

function minutesOfDay(value: string): number {
  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

async function buildBusinessContext(
  userId: string,
  tenant: AssistantTenant,
): Promise<BusinessContext> {
  return withUser(userId, async (tx) => {
    const branchRows = await tx
      .select({
        name: branches.name,
        address: branches.address,
        timezone: branches.timezone,
        isActive: branches.isActive,
      })
      .from(branches)
      .where(eq(branches.tenantId, tenant.id))
      .orderBy(asc(branches.name));

    const primaryBranch =
      branchRows.find((branch) => branch.isActive) ?? branchRows[0];
    const timezone = primaryBranch?.timezone ?? "America/Sao_Paulo";
    const today = zonedDateKey(new Date().toISOString(), timezone);
    const start = zonedTimeToUtc(today, "00:00", timezone);
    const end = zonedTimeToUtc(addDays(today, 1), "00:00", timezone);
    const weekEnd = zonedTimeToUtc(addDays(today, 7), "00:00", timezone);

    const appointmentRows = await tx
      .select({
        startsAt: appointments.startsAt,
        status: appointments.status,
        priceCents: appointments.priceCents,
        clientName: clients.name,
        professionalName: professionals.name,
        serviceName: services.name,
      })
      .from(appointments)
      .innerJoin(branches, eq(branches.id, appointments.branchId))
      .innerJoin(
        professionals,
        eq(professionals.id, appointments.professionalId),
      )
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          gte(appointments.startsAt, start),
          lte(appointments.startsAt, end),
        ),
      )
      .orderBy(asc(appointments.startsAt));

    const [upcoming] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          gte(appointments.startsAt, end),
          lte(appointments.startsAt, weekEnd),
          inArray(appointments.status, ["pending", "confirmed", "check_in"]),
        ),
      );

    const serviceRows = await tx
      .select({
        name: services.name,
        durationMinutes: services.durationMinutes,
        priceCents: services.priceCents,
      })
      .from(services)
      .where(
        and(eq(services.tenantId, tenant.id), eq(services.isActive, true)),
      )
      .orderBy(asc(services.name));

    const [clientCount] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(clients)
      .where(
        and(eq(clients.tenantId, tenant.id), eq(clients.isActive, true)),
      );

    const [paidToday] = await tx
      .select({
        total: sql<number>`coalesce(sum(${payments.amountCents}), 0)`.mapWith(
          Number,
        ),
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenant.id),
          eq(payments.status, "confirmed"),
          gte(payments.createdAt, start),
          lte(payments.createdAt, end),
        ),
      );

    const [openTotal] = await tx
      .select({
        total: sql<number>`coalesce(sum(${charges.totalCents}), 0)`.mapWith(
          Number,
        ),
      })
      .from(charges)
      .where(
        and(eq(charges.tenantId, tenant.id), eq(charges.status, "open")),
      );

    const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });

    return {
      timezone,
      today,
      tenantName: tenant.name,
      isSolo: tenant.isSolo,
      branches: branchRows.map((row) => ({
        name: row.name,
        address: row.address,
      })),
      todayAppointments: appointmentRows.map((row) => ({
        time: timeFormatter.format(row.startsAt),
        client: row.clientName,
        professional: row.professionalName,
        service: row.serviceName,
        status: STATUS_LABELS[row.status] ?? row.status,
        priceCents: row.priceCents,
      })),
      upcomingCount: upcoming?.count ?? 0,
      services: serviceRows.map((row) => ({
        name: row.name,
        durationMinutes: row.durationMinutes,
        priceCents: row.priceCents,
      })),
      clientCount: clientCount?.count ?? 0,
      paidTodayCents: paidToday?.total ?? 0,
      openTotalCents: openTotal?.total ?? 0,
    };
  });
}

function formatContext(context: BusinessContext): string {
  const lines: string[] = [
    `Hoje é ${context.today} (fuso ${context.timezone}).`,
    `Empresa: ${context.tenantName}${context.isSolo ? " (modo solo, profissional autônoma)" : ""}.`,
    `Filiais: ${context.branches.length ? context.branches.map((b) => b.name).join(", ") : "nenhuma cadastrada"}.`,
    `Clientes ativos: ${context.clientCount}.`,
    `Recebido hoje: ${formatCentsBRL(context.paidTodayCents)}.`,
    `Total em aberto (a receber): ${formatCentsBRL(context.openTotalCents)}.`,
    `Agendamentos nos próximos 7 dias (a partir de amanhã): ${context.upcomingCount}.`,
  ];

  lines.push(
    context.services.length
      ? `Serviços ativos:\n${context.services
          .map(
            (service) =>
              `- ${service.name}: ${service.durationMinutes} min, ${formatCentsBRL(service.priceCents)}`,
          )
          .join("\n")}`
      : "Serviços ativos: nenhum.",
  );

  lines.push(
    context.todayAppointments.length
      ? `Agenda de hoje:\n${context.todayAppointments
          .map(
            (appointment) =>
              `- ${appointment.time} · ${appointment.client} · ${appointment.service} · ${appointment.professional} · ${appointment.status} · ${formatCentsBRL(appointment.priceCents)}`,
          )
          .join("\n")}`
      : "Agenda de hoje: nenhum atendimento.",
  );

  return lines.join("\n");
}

async function buildWritingBrief(
  userId: string,
  tenant: AssistantTenant,
): Promise<string> {
  return withUser(userId, async (tx) => {
    const context = await getBranchContext(tx, tenant.id);
    const serviceRows = await tx
      .select({
        name: services.name,
        durationMinutes: services.durationMinutes,
        priceCents: services.priceCents,
      })
      .from(services)
      .where(
        and(eq(services.tenantId, tenant.id), eq(services.isActive, true)),
      )
      .orderBy(asc(services.name));

    return [
      `Empresa: ${tenant.name}${tenant.isSolo ? " (profissional autônoma)" : ""}.`,
      `Hoje é ${context.today}.`,
      serviceRows.length
        ? `Serviços e preços:\n${serviceRows
            .map(
              (service) =>
                `- ${service.name}: ${service.durationMinutes} min, ${formatCentsBRL(service.priceCents)}`,
            )
            .join("\n")}`
        : "Serviços: nenhum cadastrado.",
    ].join("\n");
  });
}

async function buildWeekAnalysis(
  userId: string,
  tenant: AssistantTenant,
): Promise<string> {
  return withUser(userId, async (tx) => {
    const context = await getBranchContext(tx, tenant.id);
    const lastStart = zonedTimeToUtc(
      addDays(context.today, -6),
      "00:00",
      context.timezone,
    );
    const nextEnd = zonedTimeToUtc(
      addDays(context.today, 7),
      "00:00",
      context.timezone,
    );

    const pastRows = await tx
      .select({
        status: appointments.status,
        priceCents: appointments.priceCents,
        serviceName: services.name,
      })
      .from(appointments)
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          gte(appointments.startsAt, lastStart),
          lt(appointments.startsAt, context.end),
        ),
      );

    const statusCount: Record<string, number> = {};
    const serviceCount = new Map<string, number>();
    let completedRevenueCents = 0;
    for (const row of pastRows) {
      statusCount[row.status] = (statusCount[row.status] ?? 0) + 1;
      if (row.status === "completed") {
        completedRevenueCents += row.priceCents;
      }
      const key = row.serviceName;
      serviceCount.set(key, (serviceCount.get(key) ?? 0) + 1);
    }

    const topServices = [...serviceCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `${name} (${count})`)
      .join(", ");

    const [paidLast] = await tx
      .select({
        total: sql<number>`coalesce(sum(${payments.amountCents}), 0)`.mapWith(
          Number,
        ),
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenant.id),
          eq(payments.status, "confirmed"),
          gte(payments.createdAt, lastStart),
          lt(payments.createdAt, context.end),
        ),
      );

    const [upcoming] = await tx
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        total: sql<number>`coalesce(sum(${appointments.priceCents}), 0)`.mapWith(
          Number,
        ),
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          gte(appointments.startsAt, context.end),
          lt(appointments.startsAt, nextEnd),
          inArray(appointments.status, ["pending", "confirmed", "check_in"]),
        ),
      );

    const [openTotal] = await tx
      .select({
        total: sql<number>`coalesce(sum(${charges.totalCents}), 0)`.mapWith(
          Number,
        ),
      })
      .from(charges)
      .where(
        and(eq(charges.tenantId, tenant.id), eq(charges.status, "open")),
      );

    const date = dateFormatter(context.timezone);
    return [
      `Últimos 7 dias (${date.format(lastStart)} a ${date.format(new Date(context.end.getTime() - 1))}):`,
      `- Atendimentos: ${pastRows.length} (concluídos ${statusCount.completed ?? 0}, confirmados ${statusCount.confirmed ?? 0}, aguardando ${statusCount.pending ?? 0}, cancelados ${statusCount.cancelled ?? 0}, não compareceram ${statusCount.no_show ?? 0}).`,
      `- Recebido (pagamentos confirmados): ${formatCentsBRL(paidLast?.total ?? 0)}.`,
      `- Valor dos atendimentos concluídos: ${formatCentsBRL(completedRevenueCents)}.`,
      `- Serviços mais agendados: ${topServices || "nenhum"}.`,
      `Próximos 7 dias: ${upcoming?.count ?? 0} agendamentos, valor previsto ${formatCentsBRL(upcoming?.total ?? 0)}.`,
      `Contas em aberto: ${formatCentsBRL(openTotal?.total ?? 0)}.`,
    ].join("\n");
  });
}

async function buildInactiveAnalysis(
  userId: string,
  tenant: AssistantTenant,
): Promise<string> {
  return withUser(userId, async (tx) => {
    const context = await getBranchContext(tx, tenant.id);
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const rows = await tx
      .select({
        name: clients.name,
        phone: clients.phone,
        lastVisit: sql<Date | string | null>`max(${appointments.startsAt})`,
        visits: sql<number>`count(${appointments.id})`.mapWith(Number),
      })
      .from(clients)
      .leftJoin(
        appointments,
        and(
          eq(appointments.clientId, clients.id),
          eq(appointments.tenantId, tenant.id),
        ),
      )
      .where(
        and(eq(clients.tenantId, tenant.id), eq(clients.isActive, true)),
      )
      .groupBy(clients.id, clients.name, clients.phone)
      .having(
        sql`max(${appointments.startsAt}) is null or max(${appointments.startsAt}) < ${cutoff}`,
      )
      .orderBy(sql`max(${appointments.startsAt}) asc nulls first`)
      .limit(12);

    const date = dateFormatter(context.timezone);
    return [
      `Clientes ativos sem atendimento há mais de 60 dias (até 12 listados): ${rows.length}.`,
      rows.length
        ? rows
            .map((row) => {
              const last = row.lastVisit ? new Date(row.lastVisit) : null;
              return `- ${row.name}${row.phone ? ` · ${row.phone}` : ""} · último atendimento: ${last ? date.format(last) : "nunca"} · atendimentos: ${row.visits}`;
            })
            .join("\n")
        : "- Nenhum cliente inativo encontrado.",
    ].join("\n");
  });
}

async function buildCashAnalysis(
  userId: string,
  tenant: AssistantTenant,
): Promise<string> {
  return withUser(userId, async (tx) => {
    const context = await getBranchContext(tx, tenant.id);
    const last30Start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const nextEnd = zonedTimeToUtc(
      addDays(context.today, 7),
      "00:00",
      context.timezone,
    );

    const [paid30] = await tx
      .select({
        total: sql<number>`coalesce(sum(${payments.amountCents}), 0)`.mapWith(
          Number,
        ),
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenant.id),
          eq(payments.status, "confirmed"),
          gte(payments.createdAt, last30Start),
        ),
      );

    const [completed30] = await tx
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        total: sql<number>`coalesce(sum(${appointments.priceCents}), 0)`.mapWith(
          Number,
        ),
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          eq(appointments.status, "completed"),
          gte(appointments.startsAt, last30Start),
        ),
      );

    const [openTotal] = await tx
      .select({
        total: sql<number>`coalesce(sum(${charges.totalCents}), 0)`.mapWith(
          Number,
        ),
      })
      .from(charges)
      .where(
        and(eq(charges.tenantId, tenant.id), eq(charges.status, "open")),
      );

    const [upcoming] = await tx
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        total: sql<number>`coalesce(sum(${appointments.priceCents}), 0)`.mapWith(
          Number,
        ),
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          gte(appointments.startsAt, context.end),
          lt(appointments.startsAt, nextEnd),
          inArray(appointments.status, ["pending", "confirmed", "check_in"]),
        ),
      );

    let availableMinutes = 0;
    let bookedMinutes = 0;
    if (context.primaryBranchId) {
      const hours = await tx
        .select({
          weekday: branchHours.weekday,
          startTime: branchHours.startTime,
          endTime: branchHours.endTime,
        })
        .from(branchHours)
        .where(
          and(
            eq(branchHours.tenantId, tenant.id),
            eq(branchHours.branchId, context.primaryBranchId),
          ),
        );

      const weekly = [0, 0, 0, 0, 0, 0, 0];
      for (const row of hours) {
        weekly[row.weekday] +=
          minutesOfDay(row.endTime) - minutesOfDay(row.startTime);
      }
      for (let i = 0; i < 7; i += 1) {
        const day = addDays(context.today, i);
        const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
        availableMinutes += weekly[weekday] ?? 0;
      }

      const booked = await tx
        .select({
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.tenantId, tenant.id),
            gte(appointments.startsAt, context.start),
            lt(appointments.startsAt, nextEnd),
            notInArray(appointments.status, ["cancelled", "no_show"]),
          ),
        );
      bookedMinutes = booked.reduce(
        (sum, row) =>
          sum + (row.endsAt.getTime() - row.startsAt.getTime()) / 60_000,
        0,
      );
    }

    const occupancy =
      availableMinutes > 0
        ? Math.round((bookedMinutes / availableMinutes) * 100)
        : null;

    const averageTicket =
      (completed30?.count ?? 0) > 0
        ? Math.round((completed30?.total ?? 0) / (completed30?.count ?? 1))
        : 0;

    return [
      `Recebido nos últimos 30 dias: ${formatCentsBRL(paid30?.total ?? 0)}.`,
      `Atendimentos concluídos nos últimos 30 dias: ${completed30?.count ?? 0}, valor ${formatCentsBRL(completed30?.total ?? 0)}.`,
      `Ticket médio dos atendimentos concluídos: ${formatCentsBRL(averageTicket)}.`,
      `Total em aberto (a receber): ${formatCentsBRL(openTotal?.total ?? 0)}.`,
      `Próximos 7 dias: ${upcoming?.count ?? 0} agendamentos, valor previsto ${formatCentsBRL(upcoming?.total ?? 0)}.`,
      occupancy === null
        ? "Ocupação dos próximos 7 dias: sem horário de funcionamento cadastrado."
        : `Ocupação aproximada dos próximos 7 dias: ${occupancy}% (${(bookedMinutes / 60).toFixed(1)}h agendadas de ${(availableMinutes / 60).toFixed(1)}h disponíveis; não considera bloqueios/feriados).`,
    ].join("\n");
  });
}

function systemPrompt(context: BusinessContext): string {
  return [
    "Você é o Assistente do GlowHub, um sistema de gestão para salões, barbearias e estúdios de beleza.",
    "Responda sempre em português do Brasil, de forma curta, direta e prática.",
    "Use somente os dados do contexto abaixo. Não invente números, clientes ou compromissos.",
    "Se a informação não estiver no contexto, diga que não tem esse dado e sugira onde encontrá-lo no painel.",
    "Nunca revele dados de outra empresa. Você está falando apenas com a profissional desta empresa.",
    "Você é somente leitura: não executa ações nem altera dados; oriente o caminho na interface quando necessário.",
    "",
    "Dados atuais:",
    formatContext(context),
  ].join("\n");
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function callOpenRouter(params: {
  system: string;
  user: string | ContentPart[];
  history?: AssistantMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Assistente não configurado (defina OPENROUTER_API_KEY).");
  }

  const history = (params.history ?? []).slice(-12).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://glowhub.app",
      "X-Title": "GlowHub",
    },
    body: JSON.stringify({
      model: assistantModel(),
      temperature: params.temperature ?? 0.2,
      max_tokens: params.maxTokens ?? 800,
      ...(params.json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: params.system },
        ...history,
        { role: "user", content: params.user },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    logger.error("assistant_openrouter_failed", {
      status: response.status,
      detail: detail.slice(0, 500),
    });
    throw new Error("Não foi possível falar com o assistente agora.");
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error("O assistente não retornou uma resposta.");
  }
  return answer;
}

export async function askAssistant(params: {
  userId: string;
  tenant: AssistantTenant;
  question: string;
  history: AssistantMessage[];
}): Promise<string> {
  const context = await buildBusinessContext(params.userId, params.tenant);
  return callOpenRouter({
    system: systemPrompt(context),
    user: params.question,
    history: params.history,
    temperature: 0.2,
    maxTokens: 800,
  });
}

const WRITING_LABELS: Record<WritingKind, string> = {
  whatsapp: "mensagem de WhatsApp",
  description: "descrição de serviço",
  promotion: "promoção/campanha",
  reply: "resposta a uma cliente",
  instagram: "legenda para Instagram",
};

export async function generateWriting(params: {
  userId: string;
  tenant: AssistantTenant;
  request: WritingRequest;
}): Promise<string> {
  const brief = await buildWritingBrief(params.userId, params.tenant);
  const system = [
    "Você é redator do GlowHub, especializado em negócios de beleza e estética.",
    "Gere apenas o texto final, pronto para copiar. Não inclua explicações, títulos, saudações de IA ou aspas ao redor.",
    "Use somente os serviços e preços fornecidos no contexto. Não invente preços, serviços ou promoções.",
    "Se faltar uma informação, use um marcador entre colchetes, como [nome da cliente] ou [data].",
    "Escreva em português do Brasil, natural e sem exageros.",
    "",
    "Contexto da empresa:",
    brief,
  ].join("\n");

  const user = [
    `Tipo de texto: ${WRITING_LABELS[params.request.kind]}.`,
    `Tom: ${params.request.tone}.`,
    params.request.audience
      ? `Público: ${params.request.audience}.`
      : "",
    `Contexto/instruções: ${params.request.context}`,
  ]
    .filter(Boolean)
    .join("\n");

  return callOpenRouter({
    system,
    user,
    temperature: 0.7,
    maxTokens: 700,
  });
}

const ANALYSIS_LABELS: Record<AnalysisKind, string> = {
  today: "Resumo do dia",
  week: "Resumo da semana",
  inactive: "Clientes inativos",
  cash: "Ocupação e previsão de caixa",
};

export async function runAnalysis(params: {
  userId: string;
  tenant: AssistantTenant;
  kind: AnalysisKind;
}): Promise<string> {
  let metrics: string;
  if (params.kind === "today") {
    metrics = formatContext(
      await buildBusinessContext(params.userId, params.tenant),
    );
  } else if (params.kind === "week") {
    metrics = await buildWeekAnalysis(params.userId, params.tenant);
  } else if (params.kind === "inactive") {
    metrics = await buildInactiveAnalysis(params.userId, params.tenant);
  } else {
    metrics = await buildCashAnalysis(params.userId, params.tenant);
  }

  const system = [
    "Você é analista do GlowHub, um sistema de gestão para beleza e estética.",
    "Use somente os números e dados fornecidos. Não invente valores, clientes ou tendências.",
    "Responda em português do Brasil, de forma curta e prática.",
    "Estruture em até três blocos: Resumo, Pontos de atenção e Próximos passos.",
    "Sugira ações concretas que a profissional consiga executar no painel.",
  ].join("\n");

  return callOpenRouter({
    system,
    user: [
      `Gere a análise: ${ANALYSIS_LABELS[params.kind]}.`,
      "",
      "Dados:",
      metrics,
    ].join("\n"),
    temperature: 0.3,
    maxTokens: 900,
  });
}

const receiptSchema = z.object({
  is_receipt: z.boolean().default(true),
  amount: z.union([z.string(), z.number()]).nullable().optional(),
  date: z.string().trim().max(40).nullable().optional(),
  payer: z.string().trim().max(200).nullable().optional(),
  method: z
    .enum(["pix", "credit", "debit", "cash", "transfer", "other"])
    .nullable()
    .optional(),
  reference: z.string().trim().max(300).nullable().optional(),
  confidence: z.enum(["alta", "media", "baixa"]).default("media"),
  notes: z.string().trim().max(500).nullable().optional(),
});

function parseReceiptJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // O modelo pode envolver o JSON em texto; tenta recortar o objeto.
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Lê um comprovante (imagem) e sugere cobranças em aberto compatíveis.
 * Não registra pagamento: a confirmação é sempre humana, no Financeiro.
 */
export async function analyzeReceipt(params: {
  userId: string;
  tenant: AssistantTenant;
  imageDataUrl: string;
}): Promise<ReceiptAnalysis> {
  const system = [
    "Você lê comprovantes de pagamento (Pix, cartão de crédito/débito) de um negócio de beleza.",
    "Extraia somente o que estiver legível. Não invente dados.",
    "Responda APENAS com JSON válido, sem markdown, no formato:",
    '{"is_receipt": true, "amount": "80,00", "date": "AAAA-MM-DD", "payer": "nome", "method": "pix|credit|debit|cash|transfer|other", "reference": "id/transacao", "confidence": "alta|media|baixa", "notes": "observacao curta"}',
    'Use null nos campos ausentes. "amount" é o valor em reais, com vírgula (ex.: "80,00").',
    'Se a imagem não for um comprovante de pagamento, devolva {"is_receipt": false}.',
  ].join("\n");

  const raw = await callOpenRouter({
    system,
    user: [
      {
        type: "text",
        text: "Leia este comprovante e devolva o JSON conforme o formato.",
      },
      { type: "image_url", image_url: { url: params.imageDataUrl } },
    ],
    temperature: 0,
    maxTokens: 500,
    json: true,
  });

  const json = parseReceiptJson(raw);
  if (!json) {
    throw new Error("Não foi possível ler o comprovante.");
  }
  const parsed = receiptSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Não foi possível interpretar os dados do comprovante.");
  }

  const amountText =
    parsed.data.amount === null || parsed.data.amount === undefined
      ? ""
      : String(parsed.data.amount).trim();
  const amountCents = amountText ? parsePriceToCents(amountText) : null;

  const receipt: ReceiptData = {
    amountCents,
    date: parsed.data.date || null,
    payer: parsed.data.payer || null,
    method: parsed.data.method ?? null,
    reference: parsed.data.reference || null,
    confidence: parsed.data.confidence,
    notes: parsed.data.notes || null,
  };

  if (!parsed.data.is_receipt) {
    return { isReceipt: false, receipt, candidates: [] };
  }

  const candidates = await withUser(params.userId, async (tx) => {
    const rows = await tx
      .select({
        id: charges.id,
        totalCents: charges.totalCents,
        clientName: clients.name,
        createdAt: charges.createdAt,
        description: sql<string | null>`(select ci.description from charge_items ci where ci.charge_id = ${charges.id} order by ci.created_at asc limit 1)`,
      })
      .from(charges)
      .leftJoin(clients, eq(clients.id, charges.clientId))
      .where(
        and(
          eq(charges.tenantId, params.tenant.id),
          eq(charges.status, "open"),
        ),
      )
      .orderBy(asc(charges.createdAt))
      .limit(50);

    const payer = receipt.payer?.toLowerCase().trim() ?? "";
    const scored = rows.map((row) => {
      let score = 0;
      if (receipt.amountCents !== null && row.totalCents === receipt.amountCents) {
        score += 10;
      }
      if (payer && row.clientName) {
        const clientName = row.clientName.toLowerCase();
        if (clientName.includes(payer) || payer.includes(clientName)) {
          score += 5;
        }
      }
      return { row, score };
    });

    scored.sort(
      (a, b) =>
        b.score - a.score ||
        b.row.createdAt.getTime() - a.row.createdAt.getTime(),
    );

    return scored.slice(0, 5).map(({ row }) => ({
      id: row.id,
      clientName: row.clientName,
      description: row.description ?? "Cobrança em aberto",
      totalCents: row.totalCents,
      createdAt: row.createdAt.toISOString(),
    }));
  });

  return { isReceipt: true, receipt, candidates };
}
