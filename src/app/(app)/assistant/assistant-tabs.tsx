"use client";

import { useState } from "react";
import { AnalysisPanel } from "./analysis-panel";
import { AssistantChat } from "./assistant-chat";
import { ReceiptPanel } from "./receipt-panel";
import { WritingPanel } from "./writing-panel";

type Tab = "qa" | "writing" | "analysis" | "receipts";

const TABS: { id: Tab; label: string }[] = [
  { id: "qa", label: "Perguntas" },
  { id: "writing", label: "Escrita" },
  { id: "analysis", label: "Análises" },
  { id: "receipts", label: "Comprovantes" },
];

export function AssistantTabs({
  tenantName,
  disabled,
}: {
  tenantName: string;
  disabled: boolean;
}) {
  const [tab, setTab] = useState<Tab>("qa");

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Modos do assistente"
        className="flex gap-1 rounded-full border border-border bg-white/70 p-1"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === item.id
                ? "bg-brand text-brand-foreground"
                : "text-foreground/70 hover:bg-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "qa" && (
        <AssistantChat tenantName={tenantName} disabled={disabled} />
      )}
      {tab === "writing" && <WritingPanel disabled={disabled} />}
      {tab === "analysis" && <AnalysisPanel disabled={disabled} />}
      {tab === "receipts" && <ReceiptPanel disabled={disabled} />}
    </div>
  );
}
