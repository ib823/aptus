/**
 * Content-release scoping for SAP-content reads (2608 WS1, docs/2608/BUILD-LOG.md).
 *
 * WHY THIS EXISTS. Two SAP content releases now share the ScopeItem,
 * ProcessStep and ConfigActivity tables: the 2602 rows loaded before release
 * tracking (releaseId NULL) and the 2608 rows the WS1 loaders stamp with the
 * 2608 SapContentRelease. Most reads of those tables are catalogue-wide — a
 * scope-item picker, the admin overview counts, the config matrix — and were
 * written when one release existed. Left alone they would show a 2602 user
 * J60 twice. Scoping every call site by hand is ~90 edits that drift; scoping
 * them here, on the live client, is one rule that cannot be forgotten:
 *
 *   a read of a scoped model that names neither `releaseId` nor
 *   `catalogVersionId` in its `where` sees only the ACTIVE content release
 *   (SAP_CONTENT_RELEASE, default 2608 since WS7).
 *
 * The active release is resolved per query, so flipping the env flips every
 * footer AND every catalogue read together (WS7). An assessment pinned to a
 * catalogue version keeps seeing that version regardless of the flag — that
 * is what the `catalogVersionId` escape hatch is for (AD-3).
 *
 * WHAT COUNTS AS 2602. Rows loaded before WS0 carry releaseId NULL; a 2602
 * SapContentRelease row may or may not exist (no per-file drop for 2602). So
 * "release 2602" is `releaseId IS NULL OR contentRelease.release = "2602"`,
 * and any other release is `contentRelease.release = <release>` — a relation
 * filter, so no id lookup is needed at query time.
 *
 * Writes are never touched. Reads with an explicit `releaseId`/`catalogVersionId`
 * are never touched. Models outside the list are never touched.
 */

import type { Prisma } from "@prisma/client";

import { resolveSapContentRelease, type SapContentReleaseCode } from "@/lib/sap-content/release";

/** Models that hold rows from more than one SAP content release. */
export const RELEASE_SCOPED_MODELS = ["ScopeItem", "ProcessStep", "ConfigActivity"] as const;
export type ReleaseScopedModel = (typeof RELEASE_SCOPED_MODELS)[number];

/** Read operations that take a `where` and return rows or counts. */
const SCOPED_READ_OPERATIONS = new Set(["findFirst", "findMany", "count", "aggregate", "groupBy"]);

/** The `where` fragment that selects one content release. */
export function releaseWhere(release: SapContentReleaseCode): Record<string, unknown> {
  if (release === "2602") {
    return { OR: [{ releaseId: null }, { contentRelease: { release: "2602" } }] };
  }
  return { contentRelease: { release } };
}

function mentionsReleaseOrCatalogue(where: unknown): boolean {
  if (!where || typeof where !== "object") return false;
  const w = where as Record<string, unknown>;
  if ("releaseId" in w || "catalogVersionId" in w || "contentRelease" in w) return true;
  // Nested boolean combinators (AND / OR / NOT) that already pin a release count too.
  const text = JSON.stringify(where);
  return text.includes('"releaseId"') || text.includes('"catalogVersionId"') || text.includes('"contentRelease"');
}

/**
 * Pure: given an operation's args, return the args to run. Exposed for tests.
 * `findUnique`/`findUniqueOrThrow` are deliberately excluded — their `where`
 * must be a unique selector and a 2602 id (bare scope code) or a 2608 id
 * (cuid) already belongs to exactly one release.
 */
export function scopeArgsToRelease(
  model: string | undefined,
  operation: string,
  args: unknown,
  release: SapContentReleaseCode,
): unknown {
  if (!model || !(RELEASE_SCOPED_MODELS as readonly string[]).includes(model)) return args;
  if (!SCOPED_READ_OPERATIONS.has(operation)) return args;
  const current = (args && typeof args === "object" ? args : {}) as { where?: unknown };
  if (mentionsReleaseOrCatalogue(current.where)) return args;
  const scope = releaseWhere(release);
  const where = current.where && typeof current.where === "object" ? { AND: [current.where, scope] } : scope;
  return { ...current, where };
}

/** Build the extension. A factory so tests can construct it without a live client. */
export function contentReleaseScope() {
  return {
    name: "contentReleaseScope",
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model?: string;
          operation: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          const { release } = resolveSapContentRelease();
          return query(scopeArgsToRelease(model, operation, args, release));
        },
      },
    },
  } satisfies Prisma.Extension | Record<string, unknown>;
}
