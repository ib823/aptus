/**
 * Deliver the HARVESTED Hub artifacts to a deployed instance, without bundling.
 *
 * ============================================================================
 * THE GAP THIS CLOSES
 * ============================================================================
 * #218 added 7,147 individual SAP artifacts (integrations, BAdIs, scenarios,
 * events, BO interfaces) under sap-references/hub-harvest/. Nothing in `src/`
 * read them. They were importable by `pnpm sap:hub:import` against a database
 * you hold the URL for, and unreachable by any deployed instance — so the
 * catalogue in a browser showed the curated set and nothing said why.
 *
 * The obvious fix — add them to hub-content-bundled.ts alongside the curated
 * files — is the one thing that must not happen. That module STATICALLY IMPORTS
 * its files so the admin Rebuild works without a DB secret leaving the host, and
 * a static import is a bundling instruction: 2.4MB of integrations would be
 * traced into every serverless function that transitively touches it. #218
 * records that near-miss and a test enforces it.
 *
 * So this fetches at REQUEST time instead. The files are already committed to a
 * public repository; raw.githubusercontent.com serves them from a CDN. Nothing
 * new is provisioned, and the bytes a reviewer reads in the repo are the bytes
 * the import writes.
 *
 * ============================================================================
 * PINNED TO THE DEPLOYED COMMIT, OR REFUSED
 * ============================================================================
 * The ref is the SHA THIS DEPLOYMENT WAS BUILT FROM, never a branch name.
 *
 * A branch is a moving target. Fetching `main` would mean the imported rows
 * could come from a commit the running code has never seen — and the resulting
 * catalogue would look identical either way, which is precisely the failure this
 * codebase keeps finding: a claim with nothing verifying it. Worse, it is
 * unreproducible; "which snapshot is in the database?" would again be answerable
 * only from memory, the same gap the harvest provenance block was written to fix.
 *
 * When no SHA is available the import is REFUSED with the reason, rather than
 * falling back to something that usually works. "Not probeable" is a state, not
 * an error, and it has a different fix than a failure does.
 */
import type { HubContentType } from "@/lib/sap-public/hub-content";
import {
  HARVEST_CHUNK_DEFAULT,
  HARVEST_CHUNK_MAX,
  HARVEST_REPO_PATH,
  type HarvestType,
} from "@/lib/sap-public/hub-harvest-types";

// Re-exported so callers have one import for this concern; the constants live
// in hub-harvest-types.ts because a client component needs them and this module
// reads process.env.
export {
  HARVEST_CHUNK_DEFAULT,
  HARVEST_CHUNK_MAX,
  HARVEST_REPO_PATH,
  HARVEST_TYPES,
  isHarvestType,
  type HarvestType,
} from "@/lib/sap-public/hub-harvest-types";


export interface HarvestSource {
  /** owner/name of the repository the deployment was built from. */
  repo: string;
  /** A full 40-character commit SHA. Never a branch. */
  ref: string;
  /** Which environment variable supplied the ref — recorded in provenance. */
  refSource: string;
}

/** Why a ref could not be resolved. Distinct from a failure — see header. */
export interface HarvestSourceRefusal {
  reason: string;
}

const SHA_RE = /^[0-9a-f]{40}$/i;

/**
 * Resolve the repository + commit to fetch from, or refuse with a reason.
 *
 * `HUB_HARVEST_REF` exists for deployments that are not on Vercel and therefore
 * have no VERCEL_GIT_* environment. It must still be a full SHA — the whole
 * point is a pinned, reproducible snapshot, and accepting "main" here would
 * reintroduce exactly what the header refuses.
 */
export function resolveHarvestSource(env: NodeJS.ProcessEnv = process.env): HarvestSource | HarvestSourceRefusal {
  const owner = env.VERCEL_GIT_REPO_OWNER?.trim();
  const slug = env.VERCEL_GIT_REPO_SLUG?.trim();
  const repo = env.HUB_HARVEST_REPO?.trim() || (owner && slug ? `${owner}/${slug}` : "");
  if (!repo) {
    return {
      reason:
        "No source repository. Set HUB_HARVEST_REPO=owner/name, or deploy where " +
        "VERCEL_GIT_REPO_OWNER and VERCEL_GIT_REPO_SLUG are set.",
    };
  }

  const explicit = env.HUB_HARVEST_REF?.trim();
  const vercel = env.VERCEL_GIT_COMMIT_SHA?.trim();
  const refSource = explicit ? "HUB_HARVEST_REF" : "VERCEL_GIT_COMMIT_SHA";
  const ref = explicit || vercel || "";
  if (!ref) {
    return {
      reason:
        "No commit SHA to pin to. This import fetches the harvest files at the " +
        "commit THIS deployment was built from; without it the rows could come " +
        "from code the running instance has never seen. Set HUB_HARVEST_REF to a " +
        "full 40-character SHA, or run `pnpm sap:hub:import` locally.",
    };
  }
  if (!SHA_RE.test(ref)) {
    return {
      reason:
        `Ref "${ref}" from ${refSource} is not a full 40-character commit SHA. ` +
        "A branch or tag moves, so the imported rows could not be tied back to a " +
        "known snapshot — which is the question this import exists to keep answerable.",
    };
  }
  return { repo, ref, refSource };
}

/** The raw URL for one harvested type at a pinned commit. */
export function harvestFileUrl(src: HarvestSource, type: HarvestType): string {
  return `https://raw.githubusercontent.com/${src.repo}/${src.ref}/${HARVEST_REPO_PATH}/${type}.json`;
}

export interface HarvestFetchOk {
  rows: Record<string, unknown>[];
}
export interface HarvestFetchError {
  error: string;
}

/**
 * Fetch and parse one harvested file.
 *
 * GitHub answers a missing path with 404 and an HTML/plain body, and a proxy in
 * front of it can answer with HTML too. Parsing that as JSON throws a message
 * about an unexpected token, which reads as a corrupt catalogue rather than a
 * wrong URL — so the status and the shape are both checked, and the message
 * says which URL was asked.
 */
export async function fetchHarvestRows(url: string, fetchImpl: typeof fetch = fetch): Promise<HarvestFetchOk | HarvestFetchError> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    return { error: `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res.ok) {
    return { error: `${url} returned HTTP ${res.status}. The commit may predate the harvest files, or the repository may not be public.` };
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: `${url} did not return JSON (first bytes: ${text.slice(0, 40).replace(/\s+/g, " ")}…).` };
  }
  if (!Array.isArray(parsed)) {
    return { error: `${url} returned ${typeof parsed}, expected a top-level array of rows.` };
  }
  return { rows: parsed as Record<string, unknown>[] };
}

/** A slice of a harvested file, plus what is left. */
export interface HarvestChunk {
  rows: Record<string, unknown>[];
  offset: number;
  limit: number;
  total: number;
  /** Null when this chunk finished the file. Callers must not infer it. */
  nextOffset: number | null;
}

/**
 * Take one bounded slice.
 *
 * `nextOffset` is explicit rather than left for the caller to compute, because
 * "did the import finish?" is the question an operator actually has, and a
 * response that only reports how many rows it wrote answers a different one.
 */
export function sliceHarvest(rows: Record<string, unknown>[], offset: number, limit: number): HarvestChunk {
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const safeLimit = Math.min(Math.max(Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : HARVEST_CHUNK_DEFAULT, 1), HARVEST_CHUNK_MAX);
  const slice = rows.slice(safeOffset, safeOffset + safeLimit);
  const end = safeOffset + slice.length;
  return {
    rows: slice,
    offset: safeOffset,
    limit: safeLimit,
    total: rows.length,
    nextOffset: end < rows.length ? end : null,
  };
}

/** Harvested types are real content types; this narrows for the Prisma cast. */
export function asHubContentType(t: HarvestType): HubContentType {
  return t as HubContentType;
}
