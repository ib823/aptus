/**
 * 2608 WS6 — the checked-in end-to-end chains (sap-references/2608/e2e-chains.json).
 */
import CHAINS_JSON from "../../../sap-references/2608/e2e-chains.json";

import type { TobeChain } from "./types";

interface ChainsFile {
  _provenance: { release: string; source: string };
  chains: TobeChain[];
}

export const E2E_CHAINS: TobeChain[] = (CHAINS_JSON as ChainsFile).chains;
export const E2E_CHAINS_SOURCE = (CHAINS_JSON as ChainsFile)._provenance.source;

/** Chains that touch the scope set (at least one path item in scope). */
export function chainsForScope(scopeCodes: string[], chains: TobeChain[] = E2E_CHAINS): TobeChain[] {
  const set = new Set(scopeCodes);
  return chains.filter((c) => c.path.some((code) => set.has(code)));
}
