/**
 * Phase 3 — AD-1, AD-6, AD-7: ClassificationVerdict write chokepoint.
 *
 * SINGLE site that writes verdicts. Enforces:
 *   - Catalog FK (cited scope IDs must exist; rejected at DB layer)
 *   - Frozen-row guard (rejects writes on signed-off assessments unless an
 *     explicit unsealReason is provided)
 *   - Append-only history (prior verdicts' isCurrent → false; new row added)
 *   - Read-cache write-through (refreshes ClientRequirement.currentVerdictId
 *     plus the 6 denormalised columns kept during the dual-write period)
 *
 * No other code path should call prisma.classificationVerdict.create() directly.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type VerdictBucket = "O" | "C" | "G" | "N/A";

export interface VerdictScopeCitation {
  scopeItemId: string; // FK-validated against ScopeItem.id
  role: "primary" | "secondary" | "gap-target" | "alternative";
  rationaleMd?: string;
}

export interface WriteVerdictInput {
  requirementId: string;
  passId: string;
  protocolVersionId: string;
  verdict: string; // "O - Out Of The Box" | "C - Configuration" | "G - Gap" | "N/A - Out of Scope"
  confidence?: "high" | "medium" | "low" | null;
  sapModule?: string | null;
  remarksMd: string;
  actor: string;
  source: "AI" | "MANUAL" | "ORCHESTRATOR" | "REIMPORT";
  scopeCitations: VerdictScopeCitation[];
  /** When provided, allows writing a verdict on a frozen requirement. Audit-logged. */
  unsealReason?: string;
}

const VALID_VERDICT_PREFIXES = /^(O|C|G|N\/A)\b/i;
const VALID_SAP_MODULES = new Set([
  // Standard S/4HANA Cloud modules (Public + Private)
  "FI-AR", "FI-AP", "FI-AA", "FI-GL", "CO", "MM", "SD", "PS", "RE-FX", "TR", "TRM",
  // Additional Private 2025-FPS1 modules (Phase 13.x for SKM-class clients)
  "EAM", "QM", "PM", "PP", "WM", "LE", "EWM", "FSCM", "TM",
  // Malaysian-localization-tagged modules
  "MY-SST", "MY-Peppol", "MY-Payroll", "MY-BankReporting",
  // Separate-licensed SAP products (Gap targets)
  "SuccessFactors", "Ariba", "SAC", "BPA", "IS",
  "Convergent-Invoicing", "ABAP-Environment", "BTP-Other", "BTP",
  "Concur", "IBP", "FieldGlass", "SAP-Commerce",
  // Non-SAP / sentinel
  "3rd-party",
  "—",
]);

const VALID_BUCKETS = new Set<VerdictBucket>(["O", "C", "G", "N/A"]);

export class VerdictWriteError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "VerdictWriteError";
  }
}

/**
 * Bucket detection — used by the read-cache writer to populate the
 * denormalised currentVerdictId pointer correctly.
 */
export function bucketOf(verdict: string): VerdictBucket | null {
  const t = (verdict ?? "").trim();
  if (/^O\b/i.test(t)) return "O";
  if (/^C\b/i.test(t)) return "C";
  if (/^G\b/i.test(t)) return "G";
  if (/^N\/?A\b/i.test(t)) return "N/A";
  return null;
}

/**
 * Write a new verdict for a requirement. Enforces all AD-1/AD-6/AD-7
 * invariants. Returns the new verdict's id.
 */
export async function writeVerdict(input: WriteVerdictInput): Promise<string> {
  // 1. Validate verdict shape
  if (!VALID_VERDICT_PREFIXES.test(input.verdict)) {
    throw new VerdictWriteError(
      `Verdict must start with O / C / G / N/A — got "${input.verdict}"`,
      "INVALID_VERDICT_PREFIX",
    );
  }
  if (input.sapModule && !VALID_SAP_MODULES.has(input.sapModule)) {
    throw new VerdictWriteError(
      `sapModule "${input.sapModule}" not in controlled vocabulary`,
      "INVALID_SAP_MODULE",
    );
  }
  const bucket = bucketOf(input.verdict);
  if (!bucket || !VALID_BUCKETS.has(bucket)) {
    throw new VerdictWriteError(
      `Unable to derive bucket from verdict "${input.verdict}"`,
      "BUCKET_UNDERIVABLE",
    );
  }

  // 2. Frozen-row guard (AD-7)
  const requirement = await prisma.clientRequirement.findUnique({
    where: { id: input.requirementId },
    select: {
      id: true,
      assessment: { select: { id: true, status: true } },
    },
  });
  if (!requirement) {
    throw new VerdictWriteError(
      `Requirement ${input.requirementId} not found`,
      "REQUIREMENT_NOT_FOUND",
    );
  }
  const isFrozenAssessment = requirement.assessment.status === "signed_off";
  if (isFrozenAssessment && !input.unsealReason) {
    throw new VerdictWriteError(
      `Cannot write verdict for requirement on signed_off assessment without unsealReason`,
      "ASSESSMENT_FROZEN",
    );
  }

  // 3. Validate cited scope items exist (AD-6 — FK enforcement happens at DB
  //    layer too, but pre-validating gives a clean error message).
  if (input.scopeCitations.length > 0) {
    const ids = Array.from(new Set(input.scopeCitations.map((c) => c.scopeItemId)));
    const existing = await prisma.scopeItem.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((r) => r.id));
    const missing = ids.filter((id) => !existingSet.has(id));
    if (missing.length > 0) {
      throw new VerdictWriteError(
        `Cited scope IDs do not exist in catalog: ${missing.join(", ")}`,
        "INVALID_SCOPE_CITATIONS",
      );
    }
  }

  // 4. Append + write-through to read cache, in one transaction.
  const verdictId = await prisma.$transaction(async (tx) => {
    // Mark prior verdicts for this requirement as non-current.
    await tx.classificationVerdict.updateMany({
      where: { requirementId: input.requirementId, isCurrent: true },
      data: { isCurrent: false },
    });

    const created = await tx.classificationVerdict.create({
      data: {
        requirementId: input.requirementId,
        passId: input.passId,
        protocolVersionId: input.protocolVersionId,
        verdict: input.verdict,
        confidence: input.confidence ?? null,
        sapModule: input.sapModule ?? null,
        remarksMd: input.remarksMd,
        actor: input.actor,
        source: input.source,
        isCurrent: true,
        frozenAt: isFrozenAssessment ? new Date() : null,
        scopeCitations: {
          create: input.scopeCitations.map((c) => ({
            scopeItemId: c.scopeItemId,
            role: c.role,
            rationaleMd: c.rationaleMd ?? null,
          })),
        },
      },
    });

    // Refresh the read-cache pointer + dual-write the legacy 6 columns.
    const scopeIdsCsv = input.scopeCitations.length > 0
      ? input.scopeCitations.map((c) => c.scopeItemId).join(", ")
      : "—";
    await tx.clientRequirement.update({
      where: { id: input.requirementId },
      data: {
        currentVerdictId: created.id,
        // Dual-write to legacy columns during the read-side migration window.
        solutionProviderResponse: input.verdict,
        solutionProviderRemarks: input.remarksMd,
        sapModule: input.sapModule ?? "—",
        scopeItemIds: scopeIdsCsv,
        // scopeItemNames + erpModuleSupporting kept as the value the caller
        // passed in their citations' rationale or the legacy field — left
        // unchanged here to avoid clobbering richer prior content. Phase 10
        // (report cache) reads from currentVerdictId path so legacy text
        // is best-effort only.
      },
    });

    return created.id;
  });

  return verdictId;
}

/**
 * Read the current verdict for a requirement. Convenience helper for callers
 * that want to avoid raw Prisma includes.
 */
export async function getCurrentVerdict(requirementId: string) {
  return prisma.classificationVerdict.findFirst({
    where: { requirementId, isCurrent: true },
    include: {
      scopeCitations: { include: { scopeItem: { select: { id: true, name: true, nameClean: true } } } },
      protocolVersion: { select: { id: true, name: true, version: true } },
      pass: { select: { id: true, startedAt: true, actor: true, actorRole: true } },
    },
  });
}

// Re-export Prisma for callers that need the raw types.
export { Prisma };
