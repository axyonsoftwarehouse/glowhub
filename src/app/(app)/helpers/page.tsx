import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  earnings,
  ledgerAccounts,
  memberships,
  professionals,
} from "@/db/schema";
import { PayoutList } from "@/app/(app)/finance/payout-list";
import { withUser } from "@/lib/db";
import { formatCentsBRL } from "@/lib/money";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { HelperForm } from "./helper-form";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

export default async function HelpersPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar o ajudante.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const helperRows = await tx
      .select({
        id: professionals.id,
        name: professionals.name,
        commissionBp: professionals.commissionBp,
        isActive: professionals.isActive,
        ledgerAccountId: professionals.ledgerAccountId,
      })
      .from(professionals)
      .where(
        and(
          eq(professionals.tenantId, tenant.id),
          eq(professionals.isHelper, true),
        ),
      )
      .orderBy(asc(professionals.name));

    const helperIds = helperRows.map((row) => row.id);
    const earningRows =
      helperIds.length > 0
        ? await tx
            .select({
              professionalId: earnings.professionalId,
              kind: earnings.kind,
              amountCents: earnings.amountCents,
            })
            .from(earnings)
            .where(
              and(
                eq(earnings.tenantId, tenant.id),
                eq(earnings.status, "pending"),
                inArray(earnings.professionalId, helperIds),
              ),
            )
        : [];

    const accountIds = helperRows
      .map((row) => row.ledgerAccountId)
      .filter((id): id is string => Boolean(id));
    const accountRows =
      accountIds.length > 0
        ? await tx
            .select({
              id: ledgerAccounts.id,
              code: ledgerAccounts.code,
              name: ledgerAccounts.name,
            })
            .from(ledgerAccounts)
            .where(
              and(
                eq(ledgerAccounts.tenantId, tenant.id),
                inArray(ledgerAccounts.id, accountIds),
              ),
            )
        : [];

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
      helperRows,
      earningRows,
      accountRows,
      canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
    };
  });

  const accountById = new Map(
    data.accountRows.map((row) => [row.id, row]),
  );
  const pendingByHelper = new Map<
    string,
    { commissionCents: number; tipCents: number }
  >();
  for (const row of data.earningRows) {
    const bucket = pendingByHelper.get(row.professionalId) ?? {
      commissionCents: 0,
      tipCents: 0,
    };
    if (row.kind === "commission") bucket.commissionCents += row.amountCents;
    else bucket.tipCents += row.amountCents;
    pendingByHelper.set(row.professionalId, bucket);
  }

  const payoutRows = data.helperRows
    .map((helper) => {
      const pending = pendingByHelper.get(helper.id) ?? {
        commissionCents: 0,
        tipCents: 0,
      };
      return {
        professionalId: helper.id,
        professionalName: helper.name,
        commissionCents: pending.commissionCents,
        tipCents: pending.tipCents,
      };
    })
    .filter((row) => row.commissionCents + row.tipCents > 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Ajudante</p>
        <h1 className="mt-2 text-2xl font-semibold">Quem ajuda você</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Cadastre uma ajudante eventual. Os valores dela ficam em uma conta
          própria e não se misturam com o seu caixa.
        </p>
      </header>

      {data.canManage && <HelperForm />}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Ajudantes cadastrados
          </h2>
          <Link
            href="/finance"
            className="text-xs font-medium text-brand hover:underline"
          >
            Ver caixa
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {data.helperRows.map((helper) => {
            const pending = pendingByHelper.get(helper.id) ?? {
              commissionCents: 0,
              tipCents: 0,
            };
            const account = helper.ledgerAccountId
              ? accountById.get(helper.ledgerAccountId)
              : undefined;
            const total = pending.commissionCents + pending.tipCents;

            return (
              <article
                key={helper.id}
                className="rounded-xl border border-border bg-white/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">
                      {helper.name}
                      {!helper.isActive && (
                        <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                          Inativo
                        </span>
                      )}
                    </h3>
                    <p className="mt-0.5 text-xs text-foreground/60">
                      Comissão {helper.commissionBp / 100}%
                      {account
                        ? ` · conta ${account.code} (${account.name})`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {formatCentsBRL(total)}
                    </p>
                    <p className="text-[11px] text-foreground/60">
                      a repassar
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-foreground/70">
                  <p>
                    Comissão pendente:{" "}
                    <span className="font-medium">
                      {formatCentsBRL(pending.commissionCents)}
                    </span>
                  </p>
                  <p>
                    Gorjetas pendentes:{" "}
                    <span className="font-medium">
                      {formatCentsBRL(pending.tipCents)}
                    </span>
                  </p>
                </div>
              </article>
            );
          })}

          {data.helperRows.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum ajudante cadastrado ainda.
            </p>
          )}
        </div>
      </section>

      {data.canManage && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Repasses ao ajudante
          </h2>
          <div className="mt-3">
            <PayoutList rows={payoutRows} />
          </div>
        </section>
      )}

      <p className="text-xs text-foreground/50">
        O ajudante é vinculado automaticamente aos serviços ativos e à filial
        principal. A comissão é calculada quando a cobrança do atendimento é
        criada e fica na conta própria dele até o repasse.
      </p>
    </div>
  );
}
