/**
 * ABeam Workbench — C7 session creation (CONSULTANT-SIDE).
 *
 * Creates a DiscoveryEngagement (the "session") scoped to the chosen value
 * streams and mints reviewer grants on the Affirm S9 pattern: mint a token,
 * create the grant, surface the raw token exactly once (for the /d invite URL),
 * and write a `grant_created` event per reviewer.
 *
 * Lives under lib/discovery/workbench/, behind the wall the dependency-boundary
 * test asserts is unreachable from every (external) /d entry point — session
 * creation is a consultant action and must never be callable from a client
 * surface.
 */

import { prisma } from "@/lib/db/prisma";
import { mintToken } from "@/lib/affirm/external/tokens";
import { clientValueStreams } from "@/lib/discovery/client-library";
import { writeDiscoveryEvent } from "@/lib/discovery/external/audit";

export interface NewReviewerInput {
  email: string;
  displayName: string;
  roleLabel?: string | null;
}

export interface CreateSessionInput {
  /** Free-text client/engagement label (pre-onboarding, no Organization row). */
  client: string;
  /** Value streams in scope. Empty = all 10 — the session-wide convention. */
  valueStreamIds: string[];
  reviewers: NewReviewerInput[];
  createdById: string;
}

/** One reviewer's one-time invite, surfaced exactly once (the raw token). */
export interface MintedInvite {
  grantId: string;
  email: string;
  displayName: string;
  /** Raw invite token — appears here once; only its SHA-256 is persisted. */
  rawToken: string;
}

export type CreateSessionError =
  | "bad_client"
  | "bad_scope"
  | "bad_reviewer"
  | "duplicate_reviewer"
  | "too_many_reviewers";

export type CreateSessionResult =
  | { ok: true; id: string; invites: MintedInvite[] }
  | { ok: false; error: CreateSessionError };

/** A generous ceiling — a workshop has a handful of reviewers, not hundreds. */
export const MAX_REVIEWERS = 25;
const MAX_CLIENT_LEN = 120;
const MAX_NAME_LEN = 120;
// Deliberately permissive: enough to reject "not an email" without litigating
// the RFC. Real deliverability is the invite step's problem, not this gate's.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate and create the session + reviewer grants atomically. Pure input →
 * result; the only side effects are the engagement, its grants, and their
 * events, all inside a single transaction so a mid-loop failure leaves nothing
 * half-created.
 */
export async function createDiscoverySession(
  input: CreateSessionInput,
): Promise<CreateSessionResult> {
  const client = input.client.trim();
  if (!client || client.length > MAX_CLIENT_LEN) return { ok: false, error: "bad_client" };

  // Every scoped id must be a real stream — a typo'd scope would silently hide
  // everything from the client. Empty = all 10 (stored as []).
  const known = new Set(clientValueStreams().map((vs) => vs.id));
  const scope = Array.from(new Set(input.valueStreamIds));
  if (scope.some((v) => !known.has(v))) return { ok: false, error: "bad_scope" };

  if (input.reviewers.length > MAX_REVIEWERS) return { ok: false, error: "too_many_reviewers" };
  const reviewers = input.reviewers.map((r) => ({
    email: r.email.trim().toLowerCase(),
    displayName: r.displayName.trim(),
    roleLabel: r.roleLabel?.trim() || null,
  }));
  for (const r of reviewers) {
    if (!EMAIL_RE.test(r.email) || r.email.length > MAX_NAME_LEN) return { ok: false, error: "bad_reviewer" };
    if (!r.displayName || r.displayName.length > MAX_NAME_LEN) return { ok: false, error: "bad_reviewer" };
  }
  // Two grants to the same address in one session is always a mistake, and it
  // makes the reviewers list ambiguous (which invite is live?).
  if (new Set(reviewers.map((r) => r.email)).size !== reviewers.length) {
    return { ok: false, error: "duplicate_reviewer" };
  }

  const { id, invites } = await prisma.$transaction(async (tx) => {
    const engagement = await tx.discoveryEngagement.create({
      data: { client, valueStreamIds: scope, createdById: input.createdById },
      select: { id: true },
    });

    const minted: MintedInvite[] = [];
    for (const r of reviewers) {
      const { raw, tokenHash } = mintToken();
      const grant = await tx.discoveryAccessGrant.create({
        data: {
          engagementId: engagement.id,
          email: r.email,
          displayName: r.displayName,
          roleLabel: r.roleLabel,
          // Persona scope empty = the session scope applies (see the model doc).
          valueStreamIds: [],
          tokenHash,
        },
        select: { id: true },
      });
      await writeDiscoveryEvent({
        engagementId: engagement.id,
        type: "grant_created",
        grantId: grant.id,
        actorId: input.createdById,
        payload: { email: r.email },
        tx,
      });
      minted.push({ grantId: grant.id, email: r.email, displayName: r.displayName, rawToken: raw });
    }

    return { id: engagement.id, invites: minted };
  });

  return { ok: true, id, invites };
}
