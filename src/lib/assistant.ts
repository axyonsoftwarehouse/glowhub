import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  appointments,
  branches,
  charges,
  clients,
  payments,
  professionals,
  services,
} from "@/db/schema";
import { addDays } from "@/lib/availability-data";
import { withUser } from "@/lib/db";
import { logger } from "@/lib/logger";
import { formatCentsBRL } from "@/lib/money";
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

export async function askAssistant(params: {
  userId: string;
  tenant: AssistantTenant;
  question: string;
  history: AssistantMessage[];
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Assistente não configurado (defina OPENROUTER_API_KEY).");
  }

  const context = await buildBusinessContext(params.userId, params.tenant);

  const history = params.history.slice(-12).map((message) => ({
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
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt(context) },
        ...history,
        { role: "user", content: params.question },
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
