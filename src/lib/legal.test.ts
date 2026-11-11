import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { LEGAL_VERSIONS, pendingDocuments } from "./legal";

describe("pendingDocuments", () => {
  it("pede os dois documentos para quem nunca aceitou", () => {
    expect(pendingDocuments([])).toEqual(["terms", "privacy"]);
  });

  it("não pede nada quando as versões vigentes foram aceitas", () => {
    expect(
      pendingDocuments([
        { document: "terms", version: LEGAL_VERSIONS.terms },
        { document: "privacy", version: LEGAL_VERSIONS.privacy },
      ]),
    ).toEqual([]);
  });

  it("pede de novo o documento cuja versão mudou", () => {
    expect(
      pendingDocuments([
        { document: "terms", version: "2000-01-01" },
        { document: "privacy", version: LEGAL_VERSIONS.privacy },
      ]),
    ).toEqual(["terms"]);
  });
});
