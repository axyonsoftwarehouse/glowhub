import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  campaigns,
  clients,
  giftCardRedemptions,
  giftCards,
  loyaltyPoints,
  memberships,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { getLoyaltySettings } from "@/lib/loyalty";
import { formatCentsBRL } from "@/lib/money";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import {
  CampaignForm,
  GiftCardForms,
  PointsRedeemForm,
  PointsSettingsForm,
} from "./loyalty-forms";
import type {
  CampaignRow,
  ClientOption,
  GiftCardRow,
  LoyaltySettingsView,
  PointsBalanceRow,
} from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager", "staff"];

const SEGMENT_LABELS: Record<string, string> = {
  todos: "Todos",
  novo: "Novos",
  ativo: "Ativos",
  em_risco: "Em risco",
  inativo: "Inativos",
  vip: "VIP",
  aniversariantes: "Aniversariantes",
};

const CARD_STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  redeemed: "Resgatado",
  cancelled: "Cancelado",
};

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
    date,
  );
}

export default async function LoyaltyPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar a fidelização.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const clientRows = await tx
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.tenantId, tenant.id))
      .orderBy(clients.name);

    const cardRows = await tx
      .select({
        id: giftCards.id,
        code: giftCards.code,
        initialValueCents: giftCards.initialValueCents,
        status: giftCards.status,
        expiresAt: giftCards.expiresAt,
        clientId: giftCards.clientId,
      })
      .from(giftCards)
      .where(eq(giftCards.tenantId, tenant.id))
      .orderBy(desc(giftCards.createdAt))
      .limit(50);

    const cardIds = cardRows.map((row) => row.id);
    const redemptionRows = cardIds.length
      ? await tx
          .select({
            giftCardId: giftCardRedemptions.giftCardId,
            amountCents: giftCardRedemptions.amountCents,
          })
          .from(giftCardRedemptions)
          .where(inArray(giftCardRedemptions.giftCardId, cardIds))
      : [];

    const pointsRows = await tx
      .select({
        clientId: loyaltyPoints.clientId,
        total: sql<string>`sum(${loyaltyPoints.pointsDelta})`,
      })
      .from(loyaltyPoints)
      .where(eq(loyaltyPoints.tenantId, tenant.id))
      .groupBy(loyaltyPoints.clientId);

    const campaignRows = await tx
      .select({
        id: campaigns.id,
        name: campaigns.name,
        segment: campaigns.segment,
        subject: campaigns.subject,
        audienceCount: campaigns.audienceCount,
        sentCount: campaigns.sentCount,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns)
      .where(eq(campaigns.tenantId, tenant.id))
      .orderBy(desc(campaigns.createdAt))
      .limit(20);

    const settings = await getLoyaltySettings(tx, tenant.id);

    const [membership] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenant.id),
          eq(memberships.userId, userId),
        ),
      )
      .limit(1);

    return {
      clientRows,
      cardRows,
      redemptionRows,
      pointsRows,
      campaignRows,
      settings,
      canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
    };
  });

  const clientName = new Map(data.clientRows.map((row) => [row.id, row.name]));
  const redeemedByCard = new Map<string, number>();
  for (const row of data.redemptionRows) {
    redeemedByCard.set(
      row.giftCardId,
      (redeemedByCard.get(row.giftCardId) ?? 0) + row.amountCents,
    );
  }

  const giftCardList: GiftCardRow[] = data.cardRows.map((row) => {
    const redeemed = redeemedByCard.get(row.id) ?? 0;
    return {
      id: row.id,
      code: row.code,
      initialValueCents: row.initialValueCents,
      balanceCents: Math.max(0, row.initialValueCents - redeemed),
      status: row.status,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      clientName: row.clientId ? (clientName.get(row.clientId) ?? null) : null,
    };
  });

  const pointsBalances: PointsBalanceRow[] = data.pointsRows
    .map((row) => ({
      clientId: row.clientId,
      clientName: clientName.get(row.clientId) ?? "Cliente",
      balance: Number(row.total ?? 0),
    }))
    .filter((row) => row.balance !== 0)
    .sort((a, b) => b.balance - a.balance);

  const settings: LoyaltySettingsView = data.settings ?? {
    isActive: false,
    pointsPerReal: 1,
    redeemPointsPerReal: 100,
  };
  const clientOptions: ClientOption[] = data.clientRows;
  const campaignList: CampaignRow[] = data.campaignRows.map((row) => ({
    id: row.id,
    name: row.name,
    segment: row.segment,
    subject: row.subject,
    audienceCount: row.audienceCount,
    sentCount: row.sentCount,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Fidelização</p>
        <h1 className="mt-2 text-2xl font-semibold">Gift cards, pontos e campanhas</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Ações de retenção e recompensa para os clientes de {tenant.name}.
        </p>
      </header>

      {data.canManage && <PointsSettingsForm settings={settings} />}

      {data.canManage && <GiftCardForms clients={clientOptions} />}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Gift cards
        </h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-foreground/70">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2">Validade</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {giftCardList.map((card) => (
                <tr key={card.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{card.code}</td>
                  <td className="px-3 py-2 text-foreground/70">
                    {card.clientName ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCentsBRL(card.initialValueCents)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCentsBRL(card.balanceCents)}
                  </td>
                  <td className="px-3 py-2 text-foreground/70">
                    {formatDate(card.expiresAt ? new Date(card.expiresAt) : null)}
                  </td>
                  <td className="px-3 py-2 text-foreground/70">
                    {CARD_STATUS_LABELS[card.status] ?? card.status}
                  </td>
                </tr>
              ))}
              {giftCardList.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-sm text-foreground/60">
                    Nenhum gift card emitido.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Pontos de fidelidade
        </h2>
        {data.canManage && <PointsRedeemForm clients={clientOptions} />}
        <div className="mt-4 space-y-1">
          {pointsBalances.map((row) => (
            <div
              key={row.clientId}
              className="flex items-center justify-between rounded-lg border border-border bg-white/60 px-3 py-2 text-sm"
            >
              <span>{row.clientName}</span>
              <span className="font-medium">{row.balance} pts</span>
            </div>
          ))}
          {pointsBalances.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum saldo de pontos ainda.
            </p>
          )}
        </div>
      </section>

      {data.canManage && <CampaignForm />}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Campanhas
        </h2>
        <div className="mt-4 space-y-2">
          {campaignList.map((campaign) => (
            <div
              key={campaign.id}
              className="rounded-lg border border-border bg-white/60 px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{campaign.name}</span>
                <span className="text-xs text-foreground/70">
                  {SEGMENT_LABELS[campaign.segment] ?? campaign.segment} ·{" "}
                  {campaign.sentCount}/{campaign.audienceCount} enfileirada(s) ·{" "}
                  {formatDate(new Date(campaign.createdAt))}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-foreground/60">
                {campaign.subject}
              </p>
            </div>
          ))}
          {campaignList.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhuma campanha criada.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
