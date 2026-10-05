import Link from "next/link";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand sm:w-64";

export function SearchForm({
  action,
  defaultValue,
  placeholder = "Buscar...",
  hidden = {},
}: {
  action: string;
  defaultValue?: string;
  placeholder?: string;
  hidden?: Record<string, string | undefined>;
}) {
  const hiddenEntries = Object.entries(hidden).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
  const clearHref = hiddenEntries.length
    ? `${action}?${new URLSearchParams(hiddenEntries).toString()}`
    : action;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form method="get" action={action} className="flex items-center gap-2">
        {hiddenEntries.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <input
          type="search"
          name="q"
          defaultValue={defaultValue ?? ""}
          placeholder={placeholder}
          className={inputClass}
        />
        <button
          type="submit"
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Buscar
        </button>
      </form>
      {defaultValue ? (
        <Link
          href={clearHref}
          className="text-xs text-foreground/50 hover:text-brand hover:underline"
        >
          Limpar
        </Link>
      ) : null}
    </div>
  );
}
