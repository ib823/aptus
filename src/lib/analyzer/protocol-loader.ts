/**
 * Phase 2 — AD-4: ClassificationProtocol DB loader.
 *
 * Single source of truth for the SAP best-practice classification protocol
 * text used by both the AI classifier (src/lib/analyzer/classifier.ts) and
 * the orchestrator (scripts/classify-batch.ts).
 *
 * The active protocol is pinned to a catalog version. Verdicts (Phase 3)
 * carry a protocolVersionId so the protocol used to produce them is
 * reconstructable.
 *
 * Cache: per-process in-memory, 60s TTL. Forces a re-read on protocol
 * edits without thrashing the DB on every classifier call.
 */

import { prisma } from "@/lib/db/prisma";

export interface LoadedProtocol {
  id: string;
  name: string;
  version: string;
  catalogVersionId: string;
  catalogVersion: string; // e.g. "2602"
  catalogEdition: string; // e.g. "PUBLIC"
  bucketDefinitions: Record<string, string>;
  groundingRules: string;
  systemPrompt: string;
}

interface CacheEntry {
  loadedAt: number;
  protocol: LoadedProtocol;
}

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/**
 * Load the active protocol for a given catalog version (defaults to whichever
 * catalog version is currently active). Throws if no active protocol exists.
 */
export async function loadActiveProtocol(catalogVersionId?: string): Promise<LoadedProtocol> {
  const cacheKey = catalogVersionId ?? "__active__";
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) {
    return cached.protocol;
  }

  const where = catalogVersionId
    ? { isActive: true, catalogVersionId }
    : { isActive: true };

  const row = await prisma.classificationProtocol.findFirst({
    where,
    orderBy: { createdAt: "desc" },
    include: { catalogVersion: true },
  });

  if (!row) {
    throw new Error(
      `No active ClassificationProtocol found${catalogVersionId ? ` for catalogVersionId=${catalogVersionId}` : ""}. Seed via scripts/seed-classification-protocol.ts.`,
    );
  }

  const loaded: LoadedProtocol = {
    id: row.id,
    name: row.name,
    version: row.version,
    catalogVersionId: row.catalogVersionId,
    catalogVersion: row.catalogVersion.version,
    catalogEdition: row.catalogVersion.edition,
    bucketDefinitions: row.bucketDefinitions as Record<string, string>,
    groundingRules: row.groundingRules,
    systemPrompt: row.systemPrompt,
  };

  cache.set(cacheKey, { loadedAt: Date.now(), protocol: loaded });
  return loaded;
}

/** Used by tests + admin tools to invalidate the cache. */
export function clearProtocolCache(): void {
  cache.clear();
}
