/**
 * 2608 WS6 — the checked-in end-to-end chains (sap-references/2608/e2e-chains.json).
 *
 * WS16 — chain selection needs a threshold, not any-hit. The first version
 * matched a chain when ONE of its path items was in scope, and that was wrong
 * in a way only a real engagement showed: a finance bid scoped to Accounts
 * Receivable (J59) drew the Order-to-Cash SALES chain, so the L1 page of a
 * finance pack opened on Sales Inquiry. One shared item is a shared item, not
 * the business the client runs.
 */
import CHAINS_JSON from "../../../sap-references/2608/e2e-chains.json";

import type { TobeChain } from "./types";

interface ChainsFile {
  _provenance: { release: string; source: string; orderingCaveat?: string };
  chains: TobeChain[];
}

export const E2E_CHAINS: TobeChain[] = (CHAINS_JSON as ChainsFile).chains;
export const E2E_CHAINS_SOURCE = (CHAINS_JSON as ChainsFile)._provenance.source;

/**
 * Chain order is consultant-asserted, not SAP-published: SAP's Process
 * Navigator hierarchy is not in the 2608 content drop. Renderers that present
 * a chain must say so rather than let it read as cited.
 */
export const E2E_CHAINS_ORDERING_CAVEAT =
  (CHAINS_JSON as ChainsFile)._provenance.orderingCaveat ?? "";

/** How many of a chain's path items must be in scope before the chain applies. */
export const CHAIN_MIN_PATH_HITS = 2;

/** How many of this chain's path items the scope set contains. */
export function chainPathHits(chain: TobeChain, scopeCodes: Iterable<string>): number {
  const set = scopeCodes instanceof Set ? scopeCodes : new Set(scopeCodes);
  return chain.path.filter((code) => set.has(code)).length;
}

/**
 * Chains the scope set genuinely runs.
 *
 * A chain applies when at least `minPathHits` of its path items are in scope,
 * or when the whole path is in scope for a path shorter than that. Alternates
 * do not count towards the threshold: an alternate is a variation on a chain
 * you already run, so it cannot be the evidence that you run it.
 */
export function chainsForScope(
  scopeCodes: string[],
  chains: TobeChain[] = E2E_CHAINS,
  minPathHits: number = CHAIN_MIN_PATH_HITS,
): TobeChain[] {
  const set = new Set(scopeCodes);
  return chains.filter((c) => {
    const need = Math.min(minPathHits, c.path.length);
    return need > 0 && chainPathHits(c, set) >= need;
  });
}
