import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { legalAcceptances } from "@/db/schema";

/**
 * Versoes vigentes dos documentos legais. Ao alterar o texto de forma relevante,
 * suba a versao (data AAAA-MM-DD): quem aceitou uma versao anterior sera levado a
 * aceitar de novo antes de usar o painel.
 */
export const LEGAL_VERSIONS = {
  terms: "2026-11-11",
  privacy: "2026-11-11",
} as const;

export type LegalDocument = keyof typeof LEGAL_VERSIONS;

/**
 * Dados do controlador exibidos nos documentos. PREENCHER antes do lancamento
 * (e revisar o texto com um advogado). Os valores entre colchetes aparecem
 * literalmente nas paginas ate serem trocados.
 */
export const LEGAL_COMPANY = {
  name: "[RAZÃO SOCIAL]",
  cnpj: "[CNPJ]",
  address: "[ENDEREÇO COMPLETO]",
  contactEmail: "[E-MAIL DE CONTATO]",
  dpoName: "[NOME DO ENCARREGADO (DPO)]",
  dpoEmail: "[E-MAIL DO ENCARREGADO]",
  forum: "[CIDADE/UF]",
};

export type Acceptance = { document: string; version: string };

/** Documentos cuja versao vigente ainda nao foi aceita. */
export function pendingDocuments(accepted: Acceptance[]): LegalDocument[] {
  return (Object.keys(LEGAL_VERSIONS) as LegalDocument[]).filter(
    (document) =>
      !accepted.some(
        (row) => row.document === document && row.version === LEGAL_VERSIONS[document],
      ),
  );
}

export async function getPendingDocuments(userId: string): Promise<LegalDocument[]> {
  const rows = await getDb()
    .select({ document: legalAcceptances.document, version: legalAcceptances.version })
    .from(legalAcceptances)
    .where(eq(legalAcceptances.userId, userId))
    .orderBy(desc(legalAcceptances.acceptedAt));
  return pendingDocuments(rows);
}

function clientIp(headers: Headers | undefined): string | null {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers?.get("x-real-ip") || null;
}

/** Registra o aceite das versoes vigentes de todos os documentos. */
export async function recordAcceptance(
  userId: string,
  headers: Headers | undefined,
  documents: LegalDocument[] = Object.keys(LEGAL_VERSIONS) as LegalDocument[],
): Promise<void> {
  if (documents.length === 0) return;
  const ip = clientIp(headers);
  const userAgent = headers?.get("user-agent")?.slice(0, 500) ?? null;
  const db = getDb();

  for (const document of documents) {
    const [existing] = await db
      .select({ id: legalAcceptances.id })
      .from(legalAcceptances)
      .where(
        and(
          eq(legalAcceptances.userId, userId),
          eq(legalAcceptances.document, document),
          eq(legalAcceptances.version, LEGAL_VERSIONS[document]),
        ),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(legalAcceptances).values({
      userId,
      document,
      version: LEGAL_VERSIONS[document],
      ip,
      userAgent,
    });
  }
}
