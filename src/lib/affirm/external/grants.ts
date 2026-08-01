/**
 * ABeam Workbench — Affirm external grant management (consultant side).
 *
 * Create / revoke / reissue per-executive grants and summarize them for the
 * review-screen panel. Every mutation writes an AffirmEvent with the
 * consultant's actorId and payload.grantId. Reissue chains supersession: a
 * fresh grant is minted and the old one is revoked + marked
 * supersededByGrantId, so its link goes dead and its sessions end.
 */

import { prisma } from "@/lib/db/prisma";
import type { AffirmAccessGrant } from "@prisma/client";
import { mintToken } from "./tokens";
import { writeGuestEvent } from "./audit";
import { getAffirmSetForGrant } from "./serializers";

export type GrantStatus =
  | "invited"
  | "acknowledged"
  | "verified"
  | "in_progress"
  | "answered"
  | "submitted"
  | "locked_out"
  | "revoked"
  | "reissued"
  | "expired";

export interface GrantSummary {
  id: string;
  email: string;
  displayName: string;
  roleLabel: string | null;
  valueStreamIds: string[];
  status: GrantStatus;
  answered: number;
  total: number;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  supersededByGrantId: string | null;
}

/**
 * How long an executive invite lasts when the caller does not say.
 *
 * 30 days is the pre-workshop window: long enough that an executive who is
 * travelling still gets in, short enough that a link forwarded out of an inbox
 * is dead well before the engagement ends.
 */
export const DEFAULT_GRANT_WINDOW_DAYS = 30;

export function defaultGrantExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + DEFAULT_GRANT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** Mint a grant + return the raw token (for the invite URL). Writes grant_created. */
export async function createGrant(args: {
  bundleId: string;
  email: string;
  displayName: string;
  roleLabel?: string | null;
  valueStreamIds: string[];
  /** When this executive's access ends. Required — see the model comment. */
  expiresAt: Date;
  actorId: string;
}): Promise<{ grant: AffirmAccessGrant; rawToken: string }> {
  const { raw, tokenHash } = mintToken();
  const grant = await prisma.affirmAccessGrant.create({
    data: {
      bundleId: args.bundleId,
      email: args.email,
      displayName: args.displayName,
      roleLabel: args.roleLabel ?? null,
      valueStreamIds: args.valueStreamIds,
      expiresAt: args.expiresAt,
      tokenHash,
    },
  });
  await writeGuestEvent({
    bundleId: args.bundleId,
    type: "grant_created",
    grantId: grant.id,
    actorId: args.actorId,
    payload: {
      email: args.email,
      valueStreamIds: args.valueStreamIds,
      expiresAt: args.expiresAt.toISOString(),
    },
  });
  return { grant, rawToken: raw };
}

/** Revoke a grant, end its live sessions, write grant_revoked. Idempotent. */
export async function revokeGrant(args: {
  grantId: string;
  actorId: string;
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();
  const grant = await prisma.affirmAccessGrant.findUnique({
    where: { id: args.grantId },
    select: { id: true, bundleId: true, revokedAt: true },
  });
  if (!grant || grant.revokedAt) return;

  await prisma.$transaction([
    prisma.affirmAccessGrant.update({
      where: { id: grant.id },
      data: { revokedAt: now, revokedById: args.actorId },
    }),
    prisma.affirmGuestSession.updateMany({
      where: { grantId: grant.id, endedAt: null },
      data: { endedAt: now, endedReason: "ended_by_consultant" },
    }),
  ]);
  await writeGuestEvent({
    bundleId: grant.bundleId,
    type: "grant_revoked",
    grantId: grant.id,
    actorId: args.actorId,
  });
}

/**
 * Reissue: mint a fresh grant carrying the same identity + scope, then revoke
 * the old one and mark it superseded (its link dies, its sessions end). Returns
 * the new grant + raw token for the fresh invite. Writes grant_reissued.
 */
export async function reissueGrant(args: {
  grantId: string;
  actorId: string;
  /** Window for the fresh grant. Defaults to the standard invite window. */
  expiresAt?: Date;
  now?: Date;
}): Promise<{ grant: AffirmAccessGrant; rawToken: string } | null> {
  const now = args.now ?? new Date();
  const old = await prisma.affirmAccessGrant.findUnique({ where: { id: args.grantId } });
  if (!old) return null;

  const { raw, tokenHash } = mintToken();
  const fresh = await prisma.affirmAccessGrant.create({
    data: {
      bundleId: old.bundleId,
      email: old.email,
      displayName: old.displayName,
      roleLabel: old.roleLabel,
      valueStreamIds: old.valueStreamIds,
      /*
       * A REISSUE IS AN ISSUE. Copying every field except the expiry would
       * mint an unbounded grant through the "resend" button — the exact hole
       * the expiry column closes, reachable by a different verb. The window
       * restarts from now rather than being inherited, because the old one
       * has usually lapsed (which is why someone is resending).
       */
      expiresAt: args.expiresAt ?? defaultGrantExpiry(now),
      tokenHash,
    },
  });

  await prisma.$transaction([
    prisma.affirmAccessGrant.update({
      where: { id: old.id },
      data: { revokedAt: old.revokedAt ?? now, revokedById: args.actorId, supersededByGrantId: fresh.id },
    }),
    prisma.affirmGuestSession.updateMany({
      where: { grantId: old.id, endedAt: null },
      data: { endedAt: now, endedReason: "superseded" },
    }),
  ]);

  await writeGuestEvent({
    bundleId: old.bundleId,
    type: "grant_reissued",
    grantId: fresh.id,
    actorId: args.actorId,
    payload: { supersedesGrantId: old.id },
  });

  return { grant: fresh, rawToken: raw };
}

function deriveStatus(
  grant: Pick<
    AffirmAccessGrant,
    | "ackAt"
    | "otpVerifiedUaHashes"
    | "otpAttemptCount"
    | "revokedAt"
    | "supersededByGrantId"
    | "expiresAt"
  >,
  bundleState: string,
  answered: number,
  total: number,
): GrantStatus {
  if (grant.revokedAt) {
    if (grant.supersededByGrantId) return "reissued";
    if (grant.otpAttemptCount >= 5) return "locked_out";
    return "revoked";
  }
  // Lapsing is reported like revocation because it has the same effect on the
  // holder: the link no longer opens. Checked after the revoked branch so an
  // explicitly revoked grant keeps saying so.
  if (grant.expiresAt !== null && grant.expiresAt.getTime() <= Date.now()) {
    return "expired";
  }
  if ((bundleState === "submitted" || bundleState === "released") && grant.ackAt) return "submitted";
  if (!grant.ackAt) return "invited";
  if (grant.otpVerifiedUaHashes.length === 0) return "acknowledged";
  if (total > 0 && answered >= total) return "answered";
  if (answered > 0) return "in_progress";
  return "verified";
}

/** Summaries for the review-screen grants panel (status + progress per grant). */
export async function listGrantsForBundle(bundleId: string): Promise<GrantSummary[]> {
  const bundle = await prisma.affirmBundle.findUnique({
    where: { id: bundleId },
    select: { state: true },
  });
  if (!bundle) return [];

  const grants = await prisma.affirmAccessGrant.findMany({
    where: { bundleId },
    orderBy: { createdAt: "asc" },
  });

  const responseRows = await prisma.affirmResponse.findMany({
    where: { bundleId },
    select: { questionId: true },
  });
  const answeredQuestionIds = new Set(responseRows.map((r) => r.questionId));

  const summaries: GrantSummary[] = [];
  for (const grant of grants) {
    const set = await getAffirmSetForGrant(grant.id);
    const visibleIds = set?.questions.map((q) => q.id) ?? [];
    const total = visibleIds.length;
    const answered = visibleIds.filter((id) => answeredQuestionIds.has(id)).length;
    summaries.push({
      id: grant.id,
      email: grant.email,
      displayName: grant.displayName,
      roleLabel: grant.roleLabel,
      valueStreamIds: grant.valueStreamIds,
      status: deriveStatus(grant, bundle.state, answered, total),
      answered,
      total,
      createdAt: grant.createdAt,
      expiresAt: grant.expiresAt,
      revokedAt: grant.revokedAt,
      supersededByGrantId: grant.supersededByGrantId,
    });
  }
  return summaries;
}
