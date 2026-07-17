/**
 * ABeam Workbench — the P4 capture → promote pipeline.
 *
 * ⚠ CONSULTANT-ONLY. Reads the internal register, which holds the client's own
 * words and their CRM ref. Behind the wall.
 *
 * The library JSON is byte-frozen and hash-pinned. Nothing here writes to
 * src/data/discovery/* — promotions land in DiscoveryPromotedEntry, and the
 * consultant library views compose committed-JSON + promoted rows. Folding them
 * into the JSON is the post-pilot re-emission's job, upstream.
 *
 * Two gates are enforced HERE rather than in the UI, because both are the kind
 * of rule a tired consultant at 5pm would click past:
 *
 *   §5.5 SECOND-REVIEWER — "the author of a capture is the worst judge of
 *        whether it still identifies the client". So the reviewer must be a
 *        DISTINCT identity from the author. Not merely present: distinct.
 *
 *   §5.3 AGGREGATION THRESHOLD — a capture flagged competitively sensitive stays
 *        register-only until observed at >= 2 independent clients. Below that it
 *        is one client's secret, not industry practice.
 */

import { prisma } from "@/lib/db/prisma";
import { findLibraryRow } from "./library";

export const CAPTURE_TYPES = ["T1-variant", "T2-step", "T3-process", "T4-alias"] as const;
export type CaptureType = (typeof CAPTURE_TYPES)[number];

export const CAPTURE_TYPE_LABELS: Record<CaptureType, string> = {
  "T1-variant": "T1 · “We differ” reason → variant",
  "T2-step": "T2 · Step red-line → step or alternate path",
  "T3-process": "T3 · Net-new process",
  "T4-alias": "T4 · Terminology / role correction",
};

export const CAPTURE_STATUSES = ["candidate", "promoted", "merged", "dropped"] as const;
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

export function isCaptureType(v: string): v is CaptureType {
  return (CAPTURE_TYPES as readonly string[]).includes(v);
}

/** §5.3 — the count at which a sensitive pattern becomes industry practice. */
export const SENSITIVE_SHARE_THRESHOLD = 2;

/**
 * Is a promoted entry visible in the SHARED library, or held register-only?
 *
 * Non-sensitive → shared immediately. Sensitive → only once observed at >= 2
 * independent clients (§5.3). This is a pure function so the rule is testable
 * without a database, and so the read path and the write path cannot disagree
 * about it.
 */
export function isSharedVisible(entry: { sensitive: boolean; observedCount: number }): boolean {
  if (!entry.sensitive) return true;
  return entry.observedCount >= SENSITIVE_SHARE_THRESHOLD;
}

export type PromotionRefusal =
  | { ok: false; reason: "reviewer_missing"; message: string }
  | { ok: false; reason: "reviewer_is_author"; message: string }
  | { ok: false; reason: "anonymization_unconfirmed"; message: string }
  | { ok: false; reason: "unknown_process"; message: string }
  | { ok: false; reason: "bad_input"; message: string };

export interface PromotionInput {
  captureId: string;
  type: CaptureType;
  /** The generalized name — the practice, not the client's instance. */
  name: string;
  description: string;
  linkedProcessId: string | null;
  /** Sector-level only (§4). */
  observedIndustry: string;
  sensitive: boolean;
  authoredById: string;
  reviewedById: string;
  /** The §5 checklist, explicitly ticked. Not a default. */
  anonymizationConfirmed: boolean;
}

/**
 * The gates, as a pure function. Returns null when a promotion may proceed.
 * Separated from the write so the rules can be tested exhaustively without a DB
 * — and so the wizard and the route enforce exactly the same thing.
 */
export function checkPromotion(input: PromotionInput): PromotionRefusal | null {
  if (!input.name.trim() || !input.description.trim()) {
    return { ok: false, reason: "bad_input", message: "A promotion needs a generalized name and description." };
  }
  if (!input.observedIndustry.trim()) {
    return { ok: false, reason: "bad_input", message: "Record the industry this was observed in (sector level only)." };
  }
  // §5 items 1–2, ticked explicitly. The wizard makes this a required step; the
  // write path refuses without it regardless of what the UI allowed.
  if (!input.anonymizationConfirmed) {
    return {
      ok: false,
      reason: "anonymization_unconfirmed",
      message: "Confirm the anonymization checklist before promoting.",
    };
  }
  if (!input.reviewedById) {
    return {
      ok: false,
      reason: "reviewer_missing",
      message: "A second consultant must review this before it can be promoted.",
    };
  }
  // §5.5 — the point of the rule is a SECOND pair of eyes. A promotion that
  // names its own author as reviewer satisfies the field and defeats the gate.
  if (input.reviewedById === input.authoredById) {
    return {
      ok: false,
      reason: "reviewer_is_author",
      message:
        "The reviewer must be a different consultant from the author — the author of a capture is the worst judge of whether it still identifies the client.",
    };
  }
  // T1/T2/T4 attach to a real library process; T3 is net-new and has none.
  if (input.type === "T3-process") {
    if (input.linkedProcessId) {
      return { ok: false, reason: "bad_input", message: "A net-new process does not attach to an existing one." };
    }
  } else {
    if (!input.linkedProcessId || !findLibraryRow(input.linkedProcessId)) {
      return { ok: false, reason: "unknown_process", message: "Attach this to a process in the library." };
    }
  }
  return null;
}

/** e.g. "2026-Q3" — the granularity P4 §4 uses for `captured`. */
export function quarterOf(d: Date): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/**
 * Mint the scope id (P4 §4): CC### for a net-new process, ‹id›.var-n for a
 * variant attaching to an existing one.
 */
export async function mintScopeId(type: CaptureType, linkedProcessId: string | null): Promise<string> {
  if (type === "T3-process") {
    const existing = await prisma.discoveryPromotedEntry.findMany({
      where: { type: "T3-process" },
      select: { scopeId: true },
    });
    const next =
      existing
        .map((e) => Number(/^CC(\d+)$/.exec(e.scopeId)?.[1] ?? 0))
        .reduce((m, n) => Math.max(m, n), 0) + 1;
    return `CC${String(next).padStart(3, "0")}`;
  }
  const siblings = await prisma.discoveryPromotedEntry.count({
    where: { linkedProcessId, type },
  });
  const suffix = type === "T1-variant" ? "var" : type === "T2-step" ? "step" : "alias";
  return `${linkedProcessId}.${suffix}-${siblings + 1}`;
}

export interface PromotionResult {
  ok: true;
  scopeId: string;
  /** False when §5.3 holds it register-only. */
  sharedVisible: boolean;
}

/**
 * Promote a capture. Writes the dual record atomically: the register row is
 * marked promoted, and the shared entry is created carrying no attribution.
 */
export async function promoteCapture(
  input: PromotionInput,
): Promise<PromotionResult | PromotionRefusal> {
  const refusal = checkPromotion(input);
  if (refusal) return refusal;

  const capture = await prisma.discoveryCapture.findUnique({
    where: { id: input.captureId },
    select: { id: true, status: true },
  });
  if (!capture) return { ok: false, reason: "bad_input", message: "That capture no longer exists." };
  if (capture.status === "promoted") {
    return { ok: false, reason: "bad_input", message: "That capture is already promoted." };
  }

  const scopeId = await mintScopeId(input.type, input.linkedProcessId);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.discoveryPromotedEntry.create({
      data: {
        scopeId,
        name: input.name.trim(),
        description: input.description.trim(),
        type: input.type,
        linkedProcessId: input.linkedProcessId,
        // Sector level only. The raw text and client ref stay in the register.
        observedIndustry: input.observedIndustry.trim(),
        observedCount: 1,
        completeness: input.type === "T1-variant" ? "variant-outline" : "outline",
        capturedQuarter: quarterOf(now),
        sensitive: input.sensitive,
        authoredById: input.authoredById,
        reviewedById: input.reviewedById,
        reviewedAt: now,
        captureId: input.captureId,
      },
    });
    await tx.discoveryCapture.update({
      where: { id: input.captureId },
      data: { status: "promoted", promotedAs: scopeId },
    });
  });

  return {
    ok: true,
    scopeId,
    sharedVisible: isSharedVisible({ sensitive: input.sensitive, observedCount: 1 }),
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export interface PromotedRow {
  scopeId: string;
  name: string;
  description: string;
  type: string;
  linkedProcessId: string | null;
  observedIndustry: string;
  observedCount: number;
  completeness: string;
  capturedQuarter: string;
  sensitive: boolean;
  sharedVisible: boolean;
}

/**
 * The promoted entries the consultant library composes in. Explicit select: this
 * shape carries no attribution, and cannot acquire it by someone adding a column.
 */
export async function promotedEntries(): Promise<PromotedRow[]> {
  const rows = await prisma.discoveryPromotedEntry.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      scopeId: true,
      name: true,
      description: true,
      type: true,
      linkedProcessId: true,
      observedIndustry: true,
      observedCount: true,
      completeness: true,
      capturedQuarter: true,
      sensitive: true,
    },
  });
  return rows.map((r) => ({ ...r, sharedVisible: isSharedVisible(r) }));
}
