/**
 * WHAT A VERIFY LEARNS ABOUT A DESCRIPTION'S DATASETS, BOUNDED (P1.3,
 * structural hardening round 3).
 *
 * A description an attacker controls can declare 185,000 entity sets in its
 * 8 MiB. The verify needs three things from them: the names to show and store
 * (at most MAX_LISTED_DATASETS, as the interface has always stored), how many
 * there are, and whether the interface's dataset is among them (or a name
 * that differs only in case). So that is all that is ever made of them —
 * here, as a tally that keeps only those — and the tally is taken where the
 * names are read: inside the compiler's envelope (jobs.ts), whether the
 * compiler read the description or refused it and the older reader did. What
 * crosses back to the request thread is this summary, never one entry per
 * declared set.
 *
 * When the job itself did not run (busy, its time spent, no worker), the
 * request thread reads the names with the older reader in slices of bounded
 * size, giving the event loop back between them (readDatasetsSliced): what
 * one slice costs is fixed, whatever the description holds.
 *
 * Pure apart from the slicing's yield; no I/O.
 */

import { unstorableText } from "@/lib/contracts/storable";
import { parseEntitySets } from "@/lib/sap-public/entity-set-tags";

/** How many dataset names a verify carries back, shows and stores (MAX_STORED_ENTITY_SETS). */
export const MAX_LISTED_DATASETS = 500;

export interface DatasetSummary {
  /** The first MAX_LISTED_DATASETS distinct names, in document order; unstorable names left out. */
  names: string[];
  /** How many distinct names there are in all (the same ones left out). */
  count: number;
  /** Whether the interface's dataset is one of them, exactly (OData names are case-sensitive). */
  hasEntitySet: boolean;
  /** When it is not: the first name that differs from it only in case. */
  suggestion: string | null;
}

/** A tally of dataset names as they are read: keeps the summary, never a list of every name. */
export class DatasetTally {
  private readonly seen = new Set<string>();
  private readonly names: string[] = [];
  private has = false;
  private suggestion: string | null = null;
  private readonly lower: string | null;

  constructor(private readonly entitySet: string | null) {
    this.lower = entitySet ? entitySet.toLowerCase() : null;
  }

  add(name: string): void {
    // Stored on the interface: a name PostgreSQL cannot hold (U+0000, an
    // unpaired surrogate) is no dataset anyone can address (hostile-input
    // review round 3).
    if (this.seen.has(name) || unstorableText(name)) return;
    this.seen.add(name);
    if (this.names.length < MAX_LISTED_DATASETS) this.names.push(name);
    if (!this.entitySet) return;
    if (name === this.entitySet) this.has = true;
    else if (this.suggestion === null && name.toLowerCase() === this.lower) this.suggestion = name;
  }

  summary(): DatasetSummary {
    return { names: [...this.names], count: this.seen.size, hasEntitySet: this.has, suggestion: this.has ? null : this.suggestion };
  }
}

export function summarizeDatasets(names: Iterable<string>, entitySet: string | null): DatasetSummary {
  const tally = new DatasetTally(entitySet);
  for (const n of names) tally.add(n);
  return tally.summary();
}

/** The older reader's datasets (entity-set-tags.ts), summarised: what a refused compile still verifies with. */
export function readDatasets(body: string, entitySet: string | null): DatasetSummary {
  return summarizeDatasets(
    parseEntitySets(body).map((e) => e.name),
    entitySet,
  );
}

/** Characters of description one slice of readDatasetsSliced reads before it gives the event loop back. */
export const DATASET_SLICE_CHARS = 64 * 1024;

/**
 * readDatasets, on a thread that must stay responsive: the description is
 * read in slices of about DATASET_SLICE_CHARS, each ended just before a `<`
 * (an `<EntitySet …>` tag holds no `<` after its first character, so no tag
 * is cut and the names are exactly readDatasets'), with a turn of the event
 * loop between slices. `onSlice` is for a test.
 */
export async function readDatasetsSliced(
  body: string,
  entitySet: string | null,
  onSlice: (chars: number) => void = () => {},
): Promise<DatasetSummary> {
  const tally = new DatasetTally(entitySet);
  let at = 0;
  while (at < body.length) {
    const next = body.indexOf("<", at + DATASET_SLICE_CHARS);
    const end = next < 0 ? body.length : next;
    for (const e of parseEntitySets(body.slice(at, end))) tally.add(e.name);
    onSlice(end - at);
    at = end;
    if (at < body.length) await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return tally.summary();
}
