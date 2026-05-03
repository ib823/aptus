/**
 * Single chokepoint for writing brownfield verdicts.
 *
 * Invariants enforced:
 *   1. Append-only: a write does NOT update the prior verdict — it inserts a
 *      new row and flips the prior row's isCurrent to false.
 *   2. One isCurrent verdict per (assessment, item) at any time.
 *   3. Frozen-row guard: if the parent BrownfieldAssessment.status is
 *      "signed_off", writes are refused unless options.unsealReason is given
 *      (which becomes part of the rationale and gets logged).
 *   4. All sources (RULE / MANUAL / CLAUDE_CLI / REIMPORT) go through this
 *      function so the audit trail is complete.
 */

import { prisma } from "@/lib/db/prisma";

export type VerdictBucket = "A" | "C" | "R" | "D" | "N/R" | "B";
export type VerdictConfidence = "high" | "medium" | "low";
export type VerdictSource = "RULE" | "MANUAL" | "CLAUDE_CLI" | "REIMPORT";

export interface WriteVerdictInput {
  brownfieldAssessmentId: string;
  simplificationItemId: string;
  passId: string;
  protocolVersionId: string;
  bucket: VerdictBucket;
  confidence?: VerdictConfidence;
  rationaleMd: string;
  relevantInputs?: Record<string, unknown>;
  actor: string;
  source: VerdictSource;
}

export interface WriteVerdictOptions {
  /**
   * If the parent assessment is signed_off, set this to a non-empty string
   * documenting why an override is being applied. The reason is prepended to
   * the rationale and the verdict is created with frozenAt cleared.
   */
  unsealReason?: string;
}

export class VerdictWriteFrozenError extends Error {
  constructor(public readonly assessmentId: string) {
    super(
      `BrownfieldAssessment ${assessmentId} is signed_off; verdict writes refused. ` +
        `Pass options.unsealReason to override.`,
    );
    this.name = "VerdictWriteFrozenError";
  }
}

/**
 * Write a new brownfield verdict. Returns the new verdict id.
 *
 * Behavior:
 *   - Looks up the assessment to enforce the frozen-row guard
 *   - Marks any existing isCurrent=true verdict for the same
 *     (assessment, item) as isCurrent=false in the same transaction
 *   - Inserts the new verdict with isCurrent=true
 *   - Sets frozenAt only if the assessment is signed_off AND unsealReason
 *     is NOT provided (which would have already thrown above)
 */
export async function writeBrownfieldVerdict(
  input: WriteVerdictInput,
  options: WriteVerdictOptions = {},
): Promise<string> {
  const assessment = await prisma.brownfieldAssessment.findUnique({
    where: { id: input.brownfieldAssessmentId },
    select: { status: true },
  });
  if (!assessment) {
    throw new Error(
      `BrownfieldAssessment ${input.brownfieldAssessmentId} does not exist.`,
    );
  }

  const isFrozen = assessment.status === "signed_off";
  if (isFrozen && !options.unsealReason) {
    throw new VerdictWriteFrozenError(input.brownfieldAssessmentId);
  }

  // Override case: prepend the unseal reason to the rationale for audit
  const rationale = options.unsealReason
    ? `[UNSEAL] ${options.unsealReason}\n\n${input.rationaleMd}`
    : input.rationaleMd;

  const newId = await prisma.$transaction(async (tx) => {
    await tx.brownfieldVerdict.updateMany({
      where: {
        brownfieldAssessmentId: input.brownfieldAssessmentId,
        simplificationItemId: input.simplificationItemId,
        isCurrent: true,
      },
      data: { isCurrent: false },
    });

    const data: Parameters<typeof tx.brownfieldVerdict.create>[0]["data"] = {
      brownfieldAssessmentId: input.brownfieldAssessmentId,
      simplificationItemId: input.simplificationItemId,
      passId: input.passId,
      protocolVersionId: input.protocolVersionId,
      bucket: input.bucket,
      confidence: input.confidence ?? null,
      rationaleMd: rationale,
      actor: input.actor,
      source: input.source,
      isCurrent: true,
      // We do NOT set frozenAt at write time — even on signed-off
      // assessments where the user provided an unsealReason, the new
      // verdict is "alive" (writable, not yet refrozen). A separate
      // refreeze action can sweep all current verdicts on re-sign-off.
      frozenAt: null,
    };
    if (input.relevantInputs) {
      // Prisma's InputJsonValue requires a structured-clone-friendly shape;
      // cast explicitly so exactOptionalPropertyTypes is happy.
      (data as { relevantInputsJson?: unknown }).relevantInputsJson =
        input.relevantInputs;
    }
    const created = await tx.brownfieldVerdict.create({ data });
    return created.id;
  });

  return newId;
}

/**
 * Sweep: mark all isCurrent=true verdicts for an assessment as frozen.
 * Call this when the parent assessment transitions to signed_off.
 */
export async function freezeAllCurrentVerdicts(
  brownfieldAssessmentId: string,
): Promise<number> {
  const result = await prisma.brownfieldVerdict.updateMany({
    where: { brownfieldAssessmentId, isCurrent: true, frozenAt: null },
    data: { frozenAt: new Date() },
  });
  return result.count;
}
