/**
 * Writing to SapHubContent.rawMetadataJson WITHOUT a snapshot (audit A23).
 *
 * THE ROW IS SHARED AND THE WRITERS ARE NOT. SapHubContent has one global row per
 * SAP content item, and `rawMetadataJson.probes` on it holds every tenant's
 * stored probe — every organization's connections and the deployment's own
 * tenants, side by side (see probeStorageKey). `mergeStoredProbe` promises to
 * preserve every OTHER tenant's entry, and it does, on the value it is handed.
 * The defect was the value it was handed.
 *
 * Probe-all read every probeable row's rawMetadataJson ONCE, at the start of a
 * run, then spent minutes probing (600-odd rows, eight-way, up to 30s each) and
 * wrote each row back as `mergeStoredProbe(snapshot, key, probe)` — the whole
 * column, from a copy that was minutes old. Its rate limit is per storage key, so
 * runs for other keys proceed alongside it: another organization, the same
 * organization's other connection, an admin on a deployment tenant. Whichever of
 * them wrote a row last replaced everyone else's newer entries with its snapshot.
 * An entry reported as stored disappeared, or an old 200 came back over a fresh
 * 403 and the catalogue badged a refused service ACTIVATED. The Rebuild did the
 * same to every organization at once: it spread a start-of-run copy of the whole
 * object, `probes` included, over each row it refreshed.
 *
 * SO EACH WRITE CHANGES ONLY ITS OWN KEYS, ON THE ROW AS IT IS NOW. Both writers
 * below are one UPDATE statement that computes the new value from the row's
 * current value inside the database. Postgres takes the row lock for the
 * statement and, if another writer committed first, re-evaluates against that
 * committed value — so two concurrent writes for different keys both survive,
 * whatever order they land in. No read-modify-write crosses the network, no
 * interactive transaction holds a pooled connection while it waits, and there is
 * no snapshot left to go stale.
 *
 * `mergeStoredProbe` remains the DEFINITION of the probe write: the SQL in
 * persistStoredProbe produces exactly what it would produce from the current
 * value, and tests/unit/sap-public/hub-probe-store.test.ts checks the two against
 * each other on a real database. The difference is only where the merge runs.
 */

import { prisma } from "@/lib/db/prisma";
import type { StoredProbe } from "@/lib/sap-public/hub-content";

/**
 * Set `rawMetadataJson.probes[storageKey]` on one row, leaving everything else on
 * that row exactly as it is at the moment of the write.
 *
 * Non-object values are treated as `mergeStoredProbe` treats them: a null,
 * array or scalar column becomes `{}` first, and a non-object `probes` becomes
 * `{}` before the key is set. `updatedAt` is stamped as Prisma's own update
 * would, in UTC, since a raw statement bypasses the client's `@updatedAt`.
 *
 * Returns how many rows were written: 0 when the row has since been deleted,
 * which is not an error for a probe run — there is nothing left to annotate.
 */
export async function persistStoredProbe(
  rowId: string,
  storageKey: string,
  probe: StoredProbe,
): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "SapHubContent"
    SET "rawMetadataJson" = jsonb_set(
          (CASE WHEN jsonb_typeof("rawMetadataJson") = 'object' THEN "rawMetadataJson" ELSE '{}'::jsonb END)
            || jsonb_build_object(
                 'probes',
                 CASE WHEN jsonb_typeof("rawMetadataJson"->'probes') = 'object'
                      THEN "rawMetadataJson"->'probes'
                      ELSE '{}'::jsonb END
               ),
          ARRAY['probes', ${storageKey}::text],
          ${JSON.stringify(probe)}::jsonb,
          true
        ),
        "updatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE "id" = ${rowId}`;
}

/**
 * Refresh the Rebuild's provenance keys (`source`, `apiId`) on the API rows it
 * just projected, merged into each row's CURRENT value.
 *
 * This replaces spreading a start-of-run copy of the whole object back over each
 * row, which reverted every probe written while the Rebuild ran. Only the two
 * keys the Rebuild owns are written; `probes`, `steps` and anything else on the
 * row are whatever they are when this statement runs. `apiId` is the row's own
 * externalId, which is what the projection keys the row by.
 */
export async function refreshApiProvenance(externalIds: readonly string[]): Promise<number> {
  if (externalIds.length === 0) return 0;
  return prisma.$executeRaw`
    UPDATE "SapHubContent"
    SET "rawMetadataJson" =
          (CASE WHEN jsonb_typeof("rawMetadataJson") = 'object' THEN "rawMetadataJson" ELSE '{}'::jsonb END)
            || jsonb_build_object('source', 'SapApiReference', 'apiId', "externalId")
    WHERE "contentType" = 'API' AND "externalId" = ANY(${[...externalIds]}::text[])`;
}
