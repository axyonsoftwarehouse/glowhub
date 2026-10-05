import { and, asc, count, eq, ilike, isNull } from "drizzle-orm";
import {
  categories,
  memberships,
  productVariants,
  products,
} from "@/db/schema";
import { Pagination } from "@/components/pagination";
import { SearchForm } from "@/components/search-form";
import { withUser } from "@/lib/db";
import {
  PAGE_SIZE,
  pageCount as getPageCount,
  pageOffset,
  parsePage,
} from "@/lib/pagination";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { CategoryManager } from "../services/category-manager";
import { ProductCard } from "./product-card";
import { ProductCreateForm } from "./product-create-form";
import type { Product, ProductVariant } from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar produtos.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const q = first(sp.q)?.trim() || undefined;
  const page = parsePage(first(sp.page));

  const { categories: categoryList, products: productList, total, canManage } =
    await withUser(userId, async (tx) => {
      const categoryRows = await tx
        .select({
          id: categories.id,
          name: categories.name,
          sortOrder: categories.sortOrder,
          isActive: categories.isActive,
        })
        .from(categories)
        .where(
          and(
            eq(categories.tenantId, tenant.id),
            eq(categories.kind, "product"),
            isNull(categories.parentId),
          ),
        )
        .orderBy(asc(categories.name));

      const productWhere = q
        ? and(
            eq(products.tenantId, tenant.id),
            ilike(products.name, `%${q}%`),
          )
        : eq(products.tenantId, tenant.id);

      const [productTotals] = await tx
        .select({ value: count() })
        .from(products)
        .where(productWhere);

      const productRows = await tx
        .select({
          id: products.id,
          name: products.name,
          description: products.description,
          imageUrl: products.imageUrl,
          categoryId: products.categoryId,
          isActive: products.isActive,
        })
        .from(products)
        .where(productWhere)
        .orderBy(asc(products.name))
        .limit(PAGE_SIZE)
        .offset(pageOffset(page));

      const variantRows = await tx
        .select({
          id: productVariants.id,
          productId: productVariants.productId,
          name: productVariants.name,
          sku: productVariants.sku,
          priceCents: productVariants.priceCents,
          stockQuantity: productVariants.stockQuantity,
          isActive: productVariants.isActive,
        })
        .from(productVariants)
        .where(eq(productVariants.tenantId, tenant.id))
        .orderBy(asc(productVariants.name));

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

      const variantsByProduct = new Map<string, ProductVariant[]>();
      for (const row of variantRows) {
        const list = variantsByProduct.get(row.productId) ?? [];
        list.push({
          id: row.id,
          name: row.name,
          sku: row.sku ?? null,
          priceCents: row.priceCents,
          stockQuantity: row.stockQuantity,
          isActive: row.isActive,
        });
        variantsByProduct.set(row.productId, list);
      }

      const list: Product[] = productRows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        imageUrl: row.imageUrl ?? null,
        categoryId: row.categoryId ?? null,
        isActive: row.isActive,
        variants: variantsByProduct.get(row.id) ?? [],
      }));

      return {
        categories: categoryRows,
        products: list,
        total: Number(productTotals?.value ?? 0),
        canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
      };
    });

  const totalPages = getPageCount(total);
  const makeHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (targetPage > 1) params.set("page", String(targetPage));
    const query = params.toString();
    return query ? `/products?${query}` : "/products";
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Catálogo</p>
        <h1 className="mt-2 text-2xl font-semibold">Produtos</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Produtos de venda de {tenant.name}, com variações e estoque.
        </p>
      </header>

      <CategoryManager
        categories={categoryList}
        canManage={canManage}
        kind="product"
      />

      {canManage && <ProductCreateForm categories={categoryList} />}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
            Produtos
          </h2>
          <span className="text-xs text-foreground/70">
            {total} produto(s)
          </span>
        </div>

        <div className="mt-4">
          <SearchForm
            action="/products"
            defaultValue={q}
            placeholder="Buscar por nome do produto"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {productList.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              categories={categoryList}
              canManage={canManage}
            />
          ))}

          {productList.length === 0 && (
            <p className="text-sm text-foreground/60">
              {q
                ? `Nenhum produto encontrado para "${q}".`
                : "Nenhum produto cadastrado ainda."}
            </p>
          )}
        </div>

        <Pagination page={page} pageCount={totalPages} makeHref={makeHref} />
      </section>
    </div>
  );
}
