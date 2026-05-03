import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Search Narratives" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}

interface SearchHit {
  narrativeId: string;
  itemId: string;
  sitemId: string;
  titleEn: string;
  applicationArea: string;
  rank: number;
  snippet: string;
}

export default async function NarrativeSearchPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();

  const catalog = await prisma.brownfieldCatalogVersion.findUnique({
    where: { id },
    select: { id: true, label: true, snapshotDate: true },
  });
  if (!catalog) notFound();

  const totalNarratives = await prisma.simplificationItemNarrative.count({
    where: { simplificationItem: { catalogVersionId: id } },
  });

  let hits: SearchHit[] = [];
  let resultCount = 0;
  let queryError: string | null = null;

  if (query.length >= 2) {
    try {
      // Postgres full-text search using the search_vector column installed by
      // brownfield-narrative-adapter.ts. websearch_to_tsquery accepts
      // user-friendly syntax: quoted phrases, OR keyword, NOT (-), etc.
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          narrative_id: string;
          item_id: string;
          sitem_id: string;
          title_en: string;
          application_area: string;
          rank: number;
          snippet: string;
        }>
      >(
        `SELECT
            n.id AS narrative_id,
            si.id AS item_id,
            si."sitemId" AS sitem_id,
            si."titleEn" AS title_en,
            si."applicationArea" AS application_area,
            ts_rank_cd(n.search_vector, websearch_to_tsquery('english', $1)) AS rank,
            ts_headline(
              'english',
              concat_ws(E'\\n\\n',
                coalesce(n."symptomMd", ''),
                coalesce(n."descriptionMd", ''),
                coalesce(n."solutionMd", ''),
                coalesce(n."requiredActionMd", ''),
                coalesce(n."relevancyMd", '')
              ),
              websearch_to_tsquery('english', $1),
              'MaxWords=30, MinWords=15, MaxFragments=2, FragmentDelimiter=" ... "'
            ) AS snippet
         FROM "SimplificationItemNarrative" n
         JOIN "SimplificationItem" si ON si.id = n."simplificationItemId"
         WHERE si."catalogVersionId" = $2
           AND n.search_vector @@ websearch_to_tsquery('english', $1)
         ORDER BY rank DESC, si."titleEn" ASC
         LIMIT 50`,
        query,
        id,
      );
      const countRow = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
         FROM "SimplificationItemNarrative" n
         JOIN "SimplificationItem" si ON si.id = n."simplificationItemId"
         WHERE si."catalogVersionId" = $2
           AND n.search_vector @@ websearch_to_tsquery('english', $1)`,
        query,
        id,
      );
      resultCount = countRow[0] ? Number(countRow[0].count) : 0;
      hits = rows.map((r) => ({
        narrativeId: r.narrative_id,
        itemId: r.item_id,
        sitemId: r.sitem_id,
        titleEn: r.title_en,
        applicationArea: r.application_area,
        rank: Number(r.rank),
        snippet: r.snippet ?? "",
      }));
    } catch (err) {
      queryError = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <div className="max-w-5xl">
      <Link
        href={`/admin/brownfield-catalogs/${id}`}
        className="text-sm text-blue-600 hover:underline"
      >
        ← Back to catalog
      </Link>
      <h1 className="text-3xl font-semibold text-foreground tracking-tight mt-2 mb-1">
        Search Narratives
      </h1>
      <p className="text-base text-muted-foreground mb-6">
        Lexical full-text search over {totalNarratives.toLocaleString()} item narratives parsed
        from the SAP Simplification List PDF. Postgres FTS with weighted ranking (Symptom +
        Description = highest weight; raw text = lowest). Use quoted phrases for exact match,{" "}
        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">OR</code> for alternation,{" "}
        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">-word</code> to exclude.
      </p>

      <form
        method="get"
        action={`/admin/brownfield-catalogs/${id}/search`}
        className="bg-card rounded-lg border border-border p-4 mb-6 flex items-end gap-3"
      >
        <div className="flex-1">
          <label
            htmlFor="q"
            className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            Query
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder='e.g. pool tables, "asset accounting" OR depreciation, BAdI -deprecated'
            className="w-full px-3 py-2 rounded border border-input bg-background text-sm"
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded border border-input bg-background text-sm hover:bg-muted/50"
        >
          Search
        </button>
      </form>

      {queryError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-900">
          <p className="font-medium mb-1">Query failed</p>
          <code className="text-xs">{queryError}</code>
        </div>
      )}

      {query.length === 0 && !queryError && (
        <div className="bg-card rounded-lg border border-border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Enter a query to search narrative content (Symptom, Description, Solution,
            Required Actions, Relevancy, Transport Behavior).
          </p>
        </div>
      )}

      {query.length > 0 && query.length < 2 && (
        <div className="bg-card rounded-lg border border-border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Query must be at least 2 characters.
          </p>
        </div>
      )}

      {query.length >= 2 && !queryError && (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            {resultCount === 0
              ? "No matches."
              : `${resultCount.toLocaleString()} match${resultCount === 1 ? "" : "es"}`}
            {hits.length < resultCount && <> (showing top {hits.length})</>}
          </p>

          {hits.length === 0 ? (
            <div className="bg-card rounded-lg border border-border p-12 text-center">
              <p className="text-base text-muted-foreground">
                No narratives matched <span className="font-mono">{query}</span>.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {hits.map((h) => (
                <Link
                  key={h.narrativeId}
                  href={`/admin/brownfield-catalogs/${id}/items/${h.itemId}`}
                  className="block bg-card rounded-lg border border-border p-4 hover:border-blue-500 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="text-sm font-medium text-blue-600">{h.titleEn}</h3>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      rank {h.rank.toFixed(3)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mb-2">
                    {h.sitemId} · {h.applicationArea}
                  </p>
                  <p
                    className="text-sm text-foreground leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: h.snippet }}
                  />
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
