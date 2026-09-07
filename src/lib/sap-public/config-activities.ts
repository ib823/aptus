/**
 * 2608 WS9 — "which configuration activities apply to this scope item?"
 *
 * WHY THIS EXISTS. `ConfigActivity.scopeItemId` holds only the FIRST id from
 * the source's "Main Scope Item ID" cell, and every consumer joined on it. In
 * the 2608 list 3,608 of 4,328 activities name more than one scope item —
 * J58 "Accounting and Financial Close" is named in 1,050 of them, and exactly
 * one was reachable. Anyone asking what configures J58 got a single tax-code
 * activity and reasonably concluded SAP ships almost no configuration for the
 * general ledger.
 *
 * `mainScopeItemCodes` is the parsed, GIN-indexed list. These helpers are the
 * only place that decides what "All" means, so the answer is the same wherever
 * it is asked.
 *
 * "ALL" IS NOT EXPANDED. The source publishes an activity as applying to "All"
 * rather than enumerating 822 codes, and turning that into 822 per-item claims
 * would be an assertion SAP never made. It is returned as its own bucket and
 * the caller decides — a configuration backlog wants it, a "what is specific
 * to this scope item?" answer does not.
 */
import { prisma } from "@/lib/db/prisma";

/** The literal the source uses for an activity that is not scope-item specific. */
export const ALL_SCOPE_ITEMS = "All" as const;

export interface ConfigActivityRef {
  activityId: string;
  activityDescription: string;
  configItemName: string;
  applicationArea: string;
  selfService: boolean;
  category: string;
  /** True when this row applies to "All" rather than naming the scope item. */
  appliesToAll: boolean;
}

export interface ConfigActivityQuery {
  /** Restrict to one content release. Omit for every release. */
  releaseId?: string | null;
  /** Include the activities published against "All". Default false. */
  includeAll?: boolean;
  limit?: number;
}

function toRef(r: {
  activityId: string;
  activityDescription: string;
  configItemName: string;
  applicationArea: string;
  selfService: boolean;
  category: string;
  mainScopeItemCodes: string[];
}): ConfigActivityRef {
  return {
    activityId: r.activityId,
    activityDescription: r.activityDescription,
    configItemName: r.configItemName,
    applicationArea: r.applicationArea,
    selfService: r.selfService,
    category: r.category,
    appliesToAll: r.mainScopeItemCodes.includes(ALL_SCOPE_ITEMS),
  };
}

/**
 * Configuration activities that name `scopeCode` in the source's Main Scope
 * Item ID list. Activities published against "All" are excluded unless
 * `includeAll` is set — they are not evidence about this scope item.
 */
export async function configActivitiesForScopeCode(
  scopeCode: string,
  opts: ConfigActivityQuery = {},
): Promise<ConfigActivityRef[]> {
  const code = scopeCode.trim();
  if (!code) return [];
  const codes = opts.includeAll ? [code, ALL_SCOPE_ITEMS] : [code];
  const rows = await prisma.configActivity.findMany({
    where: {
      OR: codes.map((c) => ({ mainScopeItemCodes: { has: c } })),
      ...(opts.releaseId !== undefined ? { releaseId: opts.releaseId } : {}),
    },
    select: {
      activityId: true,
      activityDescription: true,
      configItemName: true,
      applicationArea: true,
      selfService: true,
      category: true,
      mainScopeItemCodes: true,
    },
    orderBy: [{ applicationArea: "asc" }, { activityId: "asc" }],
    ...(opts.limit ? { take: opts.limit } : {}),
  });
  return rows.map(toRef);
}

/** How many activities name each of `scopeCodes`. Missing codes report 0. */
export async function configActivityCountsByScopeCode(
  scopeCodes: readonly string[],
  opts: Omit<ConfigActivityQuery, "limit"> = {},
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const code of scopeCodes) {
    const codes = opts.includeAll ? [code, ALL_SCOPE_ITEMS] : [code];
    out[code] = await prisma.configActivity.count({
      where: {
        OR: codes.map((c) => ({ mainScopeItemCodes: { has: c } })),
        ...(opts.releaseId !== undefined ? { releaseId: opts.releaseId } : {}),
      },
    });
  }
  return out;
}
