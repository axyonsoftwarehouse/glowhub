import { formatCentsBRL } from "@/lib/money";
import type { JournalEntry } from "./types";

function formatDate(iso: string): string {
  const [date] = iso.split("T");
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function JournalList({ entries }: { entries: JournalEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-foreground/60">
        Nenhum lançamento registrado ainda.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <article
          key={entry.id}
          className="rounded-xl border border-border bg-white/70 p-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{entry.description}</p>
            <span className="text-xs text-foreground/70">
              {formatDate(entry.occurredAt)}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {entry.lines.map((line) => (
              <div
                key={line.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-foreground/70">
                  <span
                    className={
                      line.direction === "debit"
                        ? "text-foreground/70"
                        : "text-brand"
                    }
                  >
                    {line.direction === "debit" ? "D" : "C"}
                  </span>{" "}
                  {line.accountCode} · {line.accountName}
                </span>
                <span
                  className={
                    line.direction === "debit"
                      ? "font-medium"
                      : "font-medium text-foreground/60"
                  }
                >
                  {formatCentsBRL(line.amountCents)}
                </span>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
