/**
 * THE /SCHEMA TEXTS RE-RENDERED FROM STORED DATA AFTER A RENDERER CHANGE
 * (P1.3, consolidated review round 2).
 *
 * GET /schema serves texts only at the running SCHEMA_TEXTS_VERSION
 * (render-version.ts), so a deploy that bumps it — or an Instant Rollback
 * across one — used to leave every interface of every tenant NOT_RENDERED
 * until someone re-verified each against its live SAP system. The texts are
 * a pure function of what the row already stores (its IR as `ir::text`, its
 * dataset and its canonical size), so they are rendered again from that,
 * here, run by scripts/rerender-schema-texts.ts from `vercel-build` after the
 * migrations (and by hand after an Instant Rollback across a bump).
 *
 * WHICH ROWS. Each interface's CURRENT row (the one /schema serves: the
 * newest of its service and dataset) whose texts are not of the running
 * version, when no other row of the interface holds texts (an interface
 * pointed back at an earlier dataset keeps its texts on the later row, R7)
 * and its contract is within the documents' budget (past it /schema answers
 * TOO_LARGE whatever the texts). The write repeats both conditions, so a
 * verify that recorded meanwhile is never overwritten.
 *
 * HOW. Each row's render is a `texts` job in the worker envelope with no
 * tenant: the worker's heap and deadline hold as for any job, and no
 * organisation's allowance is spent. A row refused (its texts past their
 * 1 MiB cap, or a limit) stays NOT_RENDERED, and is said; the run stops at
 * its own deadline and never throws for one row.
 */

import { Prisma } from "@prisma/client";

import { LIMITS } from "@/lib/contracts/budget";
import { runJobInEnvelope } from "@/lib/contracts/envelope";
import { textOf, type Text } from "@/lib/contracts/jobs";
import { SCHEMA_TEXTS_VERSION } from "@/lib/contracts/render-version";
import { prisma } from "@/lib/db/prisma";

export interface RerenderOutcome {
  /** Rows given texts at the running version. */
  rendered: number;
  /** Rows whose render was refused (its texts past their cap, or a job limit): still NOT_RENDERED. */
  refused: number;
  /** Rows written meanwhile by a verify or a capture, or no longer current: left as they are. */
  skipped: number;
  /** Rows not reached before the deadline (or with the compiler off): run again. */
  left: number;
}

interface Candidate {
  id: string;
  organizationId: string;
  interfaceId: string;
  entitySet: string;
  irBytes: number;
}

/** The rows to re-render (see the header): one statement over every organisation, or the one named. */
async function candidates(organizationId: string | null): Promise<Candidate[]> {
  return prisma.$queryRaw<Candidate[]>(Prisma.sql`
    SELECT c."id", c."organizationId", c."interfaceId", c."entitySet", c."irBytes"
    FROM (
      SELECT DISTINCT ON (s."interfaceId") s."id", s."organizationId", s."interfaceId", s."entitySet", s."irBytes", s."schemaTextsVersion"
      FROM "ContractSnapshot" s
      JOIN "Interface" i ON i."id" = s."interfaceId" AND i."organizationId" = s."organizationId"
        AND i."externalId" = s."externalId" AND i."entitySet" = s."entitySet"
      ${organizationId === null ? Prisma.empty : Prisma.sql`WHERE s."organizationId" = ${organizationId}`}
      ORDER BY s."interfaceId", s."semverMajor" DESC, s."semverMinor" DESC, s."semverPatch" DESC
    ) c
    WHERE c."schemaTextsVersion" IS DISTINCT FROM ${SCHEMA_TEXTS_VERSION}
      AND c."irBytes" IS NOT NULL AND c."irBytes" <= ${LIMITS.document.contractsCap}
      AND NOT EXISTS (
        SELECT 1 FROM "ContractSnapshot" o
        WHERE o."organizationId" = c."organizationId" AND o."interfaceId" = c."interfaceId" AND o."id" <> c."id" AND o."schemasText" IS NOT NULL
      )
    ORDER BY c."organizationId", c."interfaceId"
  `);
}

/**
 * Re-render every candidate row, one worker job each, until `deadlineAt` (ms
 * since the epoch); every organisation's, or only `organizationId`'s.
 */
export async function rerenderSchemaTexts(opts: { deadlineAt?: number | null; organizationId?: string | null } = {}): Promise<RerenderOutcome> {
  const deadlineAt = opts.deadlineAt ?? null;
  const out: RerenderOutcome = { rendered: 0, refused: 0, skipped: 0, left: 0 };
  const rows = await candidates(opts.organizationId ?? null);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (deadlineAt !== null && Date.now() >= deadlineAt) {
      out.left += rows.length - i;
      break;
    }
    const [stored] = await prisma.$queryRaw<{ ir: string }[]>(Prisma.sql`
      SELECT "ir"::text AS "ir" FROM "ContractSnapshot" WHERE "id" = ${row.id} AND "organizationId" = ${row.organizationId}
    `);
    if (!stored) {
      out.skipped += 1;
      continue;
    }
    const r = await runJobInEnvelope({ kind: "texts", input: { ir: stored.ir, entitySet: row.entitySet, bytes: row.irBytes } }, { tenant: null, deadlineAt });
    if (!r.ok) {
      // The compiler off, or no time left for a job: the rest wait for the next run.
      if (r.reason === "DISABLED" || r.reason === "BUSY") {
        out.left += rows.length - i;
        break;
      }
      console.error("[contracts] schema texts not re-rendered", { snapshotId: row.id, reason: r.reason, ...(r.cause ? { cause: r.cause } : {}) });
      out.refused += 1;
      continue;
    }
    if (!r.value.ok) {
      console.error("[contracts] schema texts not re-rendered", { snapshotId: row.id, reason: r.value.reason });
      out.refused += 1;
      continue;
    }
    const t = r.value.texts;
    const text = (x: Text | null) => (x === null ? null : textOf(x));
    const written = await prisma.$executeRaw(Prisma.sql`
      UPDATE "ContractSnapshot" s
      SET "schemasText" = ${textOf(t.schemas)}, "createBodyText" = ${text(t.create)}, "updateBodyText" = ${text(t.update)},
        "schemaTextsVersion" = ${SCHEMA_TEXTS_VERSION}
      WHERE s."id" = ${row.id} AND s."organizationId" = ${row.organizationId}
        AND s."schemaTextsVersion" IS DISTINCT FROM ${SCHEMA_TEXTS_VERSION}
        AND NOT EXISTS (
          SELECT 1 FROM "ContractSnapshot" o
          WHERE o."organizationId" = ${row.organizationId} AND o."interfaceId" = ${row.interfaceId} AND o."id" <> ${row.id} AND o."schemasText" IS NOT NULL
        )
    `);
    if (written === 1) out.rendered += 1;
    else out.skipped += 1;
  }
  return out;
}
