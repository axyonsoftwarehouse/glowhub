import Link from "next/link";

const linkClass =
  "rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted";

export function Pagination({
  page,
  pageCount,
  makeHref,
}: {
  page: number;
  pageCount: number;
  makeHref: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav className="mt-6 flex items-center justify-between">
      {page > 1 ? (
        <Link href={makeHref(page - 1)} className={linkClass}>
          Anterior
        </Link>
      ) : (
        <span className={`${linkClass} cursor-not-allowed opacity-40`}>
          Anterior
        </span>
      )}
      <span className="text-xs text-foreground/50">
        Página {page} de {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={makeHref(page + 1)} className={linkClass}>
          Próxima
        </Link>
      ) : (
        <span className={`${linkClass} cursor-not-allowed opacity-40`}>
          Próxima
        </span>
      )}
    </nav>
  );
}
