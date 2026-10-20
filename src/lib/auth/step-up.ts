/**
 * MFA step-up on governance actions (roadmap P0.12).
 *
 * THE GAP THIS CLOSES. Separation of duties (requester ≠ approver, owners
 * cannot mint their own app's key) holds only while a session belongs to the
 * person it names. A stolen session cookie could approve access, mint a PROD
 * key or save a connection's SAP password, and nothing asked for a second
 * factor: the Studio and Control Tower layouts check MFA only when the
 * organization requires it or the user opted in, and the CoreEdge layout and
 * the API routes never did. These actions now need a passkey assertion made on
 * this session within the last few minutes.
 *
 * THE ACTIONS, and every route that performs one (each calls `requireStepUp`
 * after its own role and ownership gates, immediately before it writes):
 *
 *   grant.decide             PATCH /api/studio/access-grants
 *                            POST  /api/coreedge/requests/[id]/decide
 *                            PATCH /api/control-tower/grants
 *   grant.revoke             POST  /api/control-tower/grants/[grantId]/revoke
 *   credential.issue/rotate  POST  /api/studio/clients
 *   credential.rotate        PATCH /api/studio/clients            (action: rotate)
 *   credential.revoke        PATCH /api/studio/clients            (action: revoke)
 *                            POST  /api/coreedge/keys/[clientId]/revoke
 *   write_key.issue          POST  /api/studio/clients/write-credential
 *   claim_link.send          POST  /api/coreedge/keys/claim-link
 *   connection.save_secrets  POST  /api/studio/connections
 *   connection.enable_writes PATCH /api/studio/connections      (when it turns writes on)
 *
 *   passkey.add              GET    /api/auth/webauthn/register/options (beside one)
 *                            POST   /api/auth/webauthn/register/verify  (beside one)
 *   passkey.remove           DELETE /api/auth/webauthn/credentials/[credentialId]
 *
 * THE PASSKEYS THEMSELVES ARE ON THE LIST because the step-up is only as strong
 * as the set of passkeys it accepts. A stolen session that could add its own
 * authenticator could then step up with it, and one that could remove the
 * person's passkeys could make its own the first. So adding a passkey beside an
 * existing one, and removing one, need a fresh assertion from a passkey the
 * person already has. A FIRST passkey cannot: there is nothing to assert with.
 * That enrolment is trust on first use, made visible instead — every passkey
 * added or removed is a ConfigAudit row, and every one added is an email to the
 * person (lib/auth/passkey-events.ts). Enrolling is never itself an assertion:
 * only a passkey sign-in or a step-up stamps `passkeyAssertedAt`.
 *
 * Deliberately not on the list: raising a request (the requester is not the
 * control), the lane re-check and connection test (they read, and are rate
 * limited), and collecting a key from a claim link (the recipient holds a
 * one-time link, not a console session; the SENDING is gated).
 *
 * THREE MODES, env-controlled via COREEDGE_STEP_UP:
 *   enforce — no fresh assertion, no action: 403 with a code the console
 *             answers by asking for the passkey (or for enrolment) and
 *             retrying.
 *   warn    — the DEFAULT. The action goes ahead, and an append-only
 *             ConfigAudit row (StepUp / STEP_UP_MISSING) records that it went
 *             ahead without one. Most approvers have no passkey today and the
 *             production relying-party ID (WEBAUTHN_RP_ID) is not settled, so
 *             enforcing on deploy would lock out the people the approvals need.
 *             The rows are the burn-in: switch to enforce when they stop
 *             appearing. The runbook is docs/runbooks/coreedge-step-up.md.
 *   off     — nothing is checked or recorded (escape hatch, not a steady state).
 *
 * INSIDE A TRANSACTION, CHECK; RECORD AFTER IT. The decision routes evaluate
 * the gate while holding the Solution row lock. `checkStepUp` is pure, so it
 * belongs there; the warn-mode audit row does not. Written on the pooled
 * client from inside the transaction, it needs a second connection while the
 * transaction holds one, and with the pool exhausted by decisions queued on
 * the same lock it waits for itself until every decision times out. Those
 * routes call `recordStepUpMissing` once the transaction has ended; every
 * other route calls `requireStepUp`, which does both.
 *
 * TOKENS ARE REFUSED IN EVERY MODE, off included. A personal or CI token has no
 * passkey to step up with, so "allow and record" would mean a token can do
 * what the step-up exists to stop. Today every caller is a cookie session;
 * this is the line the token features (P2.11a, P3.2, P3.3) inherit.
 */

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { isAdminRole } from "@/lib/auth/permissions";
import { STEP_UP_CODES, type StepUpCode } from "@/lib/auth/step-up-codes";
import { writeConfigAudit } from "@/lib/studio/audit";
import { canMutateStudio } from "@/lib/studio/rbac";
import type { SessionUser } from "@/types/assessment";

export { STEP_UP_MAX_AGE_SECONDS } from "@/lib/auth/step-up-codes";

export type StepUpMode = "off" | "warn" | "enforce";

/**
 * The mode in force. Anything unrecognised reads as warn: a typo must neither
 * lock every approver out (enforce) nor silently stop the record (off).
 */
export function stepUpMode(env: NodeJS.ProcessEnv = process.env): StepUpMode {
  const value = env.COREEDGE_STEP_UP?.trim().toLowerCase();
  if (value === "off" || value === "warn" || value === "enforce") return value;
  return "warn";
}

export type GovernanceAction =
  | "grant.decide"
  | "grant.revoke"
  | "credential.issue"
  | "credential.rotate"
  | "credential.revoke"
  | "write_key.issue"
  | "claim_link.send"
  | "connection.save_secrets"
  | "connection.enable_writes"
  | "passkey.add"
  | "passkey.remove";

/**
 * Tolerance for a timestamp slightly in the future. The assertion time is
 * written by one serverless instance and read by another; their clocks can
 * disagree by a little, and a step-up made a second ago must not read as
 * stale because of it. Anything further ahead is not skew and is not fresh.
 */
const CLOCK_SKEW_MS = 30_000;

/** Did this session assert a passkey within `maxAgeSeconds` of `now`? */
export function hasFreshStepUp(
  user: Pick<SessionUser, "passkeyAssertedAt">,
  maxAgeSeconds: number,
  now: Date = new Date(),
): boolean {
  const at = user.passkeyAssertedAt;
  if (!at) return false;
  const ageMs = now.getTime() - at.getTime();
  return ageMs >= -CLOCK_SKEW_MS && ageMs <= maxAgeSeconds * 1000;
}

/** True for a caller authenticated by anything other than a person's session. */
function isTokenCaller(user: Pick<SessionUser, "authMethod">): boolean {
  // Absent means "session": `validateSession` is the only producer of a
  // SessionUser today and sets it. A token kind is refused by name.
  return user.authMethod !== undefined && user.authMethod !== "session";
}

/**
 * May this role perform any governance action at all? Used to decide who sees
 * the step-up banner, never as a gate: every route keeps its own.
 */
export function canPerformGovernanceActions(role: string | null | undefined): boolean {
  if (!role) return false;
  return isAdminRole(role) || canMutateStudio(role);
}

export interface StepUpContext {
  readonly action: GovernanceAction;
  /** The row acted on, when the route knows it. Recorded on a warn-mode event. */
  readonly targetId?: string | null;
  /**
   * The tenant the warn-mode audit row belongs to. Defaults to the user's own;
   * a global admin acting on another tenant's row passes that row's.
   */
  readonly organizationId?: string | null;
  /** For tests. */
  readonly now?: Date;
}

type StepUpRefusal = { readonly ok: false; readonly code: StepUpCode; readonly response: NextResponse };

export type StepUpResult =
  | {
      readonly ok: true;
      /** fresh: asserted in time. off: not checked. warned: allowed and recorded. */
      readonly outcome: "fresh" | "off" | "warned";
    }
  | StepUpRefusal;

/** A warn-mode admission not yet recorded: what `recordStepUpMissing` writes. */
export interface StepUpMissing {
  readonly user: SessionUser;
  readonly maxAgeSeconds: number;
  readonly context: StepUpContext;
}

/**
 * The gate's verdict before anything is written. `warned` carries the record
 * the caller must hand to `recordStepUpMissing`.
 */
export type StepUpCheck =
  | { readonly ok: true; readonly outcome: "fresh" | "off" }
  | { readonly ok: true; readonly outcome: "warned"; readonly missing: StepUpMissing }
  | StepUpRefusal;

const REFUSAL_COPY: Record<StepUpCode, string> = {
  STEP_UP_REQUIRED:
    "This needs a fresh passkey check. Confirm with your passkey and try again. Nothing has changed.",
  STEP_UP_ENROLMENT_REQUIRED:
    "This needs a passkey and your account has none. Add one under Settings → Security, " +
    "then try again. Nothing has changed.",
  STEP_UP_TOKEN_REFUSED:
    "A personal or CI token cannot approve access, issue, rotate or revoke a key, send a claim " +
    "link or change a connection's secrets or writes. Sign in as yourself and confirm with your passkey.",
};

/**
 * One envelope for every route, Studio and CoreEdge alike: `{ error: { code,
 * message, correlationId, stepUp } }` with 403. The console's step-up helper
 * reads `code`; every existing caller already reads `message`.
 */
function refusal(code: StepUpCode, context: StepUpContext, maxAgeSeconds: number): StepUpRefusal {
  const correlationId = randomUUID();
  return {
    ok: false,
    code,
    response: NextResponse.json(
      {
        error: {
          code,
          message: REFUSAL_COPY[code],
          correlationId,
          stepUp: { action: context.action, maxAgeSeconds },
        },
      },
      { status: 403, headers: { "x-correlation-id": correlationId } },
    ),
  };
}

/**
 * Gate a governance action on a fresh passkey assertion, recording a warn-mode
 * admission before it returns.
 *
 * Call it AFTER the route's own role, tenant and ownership checks and
 * immediately BEFORE the write, so that a person is asked for a passkey only
 * when the passkey is the one thing standing between them and the action.
 * Inside a transaction, use `checkStepUp` and `recordStepUpMissing` instead.
 */
export async function requireStepUp(
  user: SessionUser,
  maxAgeSeconds: number,
  context: StepUpContext,
): Promise<StepUpResult> {
  const check = checkStepUp(user, maxAgeSeconds, context);
  if (check.ok && check.outcome === "warned") {
    await recordStepUpMissing(check.missing);
    return { ok: true, outcome: "warned" };
  }
  return check;
}

/**
 * The gate itself, with no I/O, so it is safe inside a transaction. A
 * `warned` verdict is the caller's to record, with `recordStepUpMissing`, once
 * the transaction has ended.
 */
export function checkStepUp(user: SessionUser, maxAgeSeconds: number, context: StepUpContext): StepUpCheck {
  if (isTokenCaller(user)) return refusal(STEP_UP_CODES.tokenRefused, context, maxAgeSeconds);

  const mode = stepUpMode();
  if (mode === "off") return { ok: true, outcome: "off" };

  const now = context.now ?? new Date();
  if (hasFreshStepUp(user, maxAgeSeconds, now)) return { ok: true, outcome: "fresh" };

  if (mode === "enforce") {
    return refusal(
      user.hasWebAuthn ? STEP_UP_CODES.required : STEP_UP_CODES.enrolmentRequired,
      context,
      maxAgeSeconds,
    );
  }

  return { ok: true, outcome: "warned", missing: { user, maxAgeSeconds, context } };
}

/**
 * The warn-mode record: who acted, on what, and why no step-up counted.
 *
 * ONE ROW PER ADMISSION. It records what enforce mode would have refused,
 * which is the number the switch to enforce depends on — including the rare
 * admission whose write then loses a race and changes nothing. `requireStepUp`
 * writes it before the route's write; a route that checks inside a
 * transaction writes it after the transaction, whatever it returned.
 * Best-effort like every ConfigAudit write: a failed audit row must not fail
 * the person's action, and `writeConfigAudit` logs it loudly.
 */
export async function recordStepUpMissing({ user, maxAgeSeconds, context }: StepUpMissing): Promise<void> {
  const organizationId = context.organizationId ?? user.organizationId;
  const reason = !user.hasWebAuthn ? "no_passkey" : user.passkeyAssertedAt ? "stale" : "never_asserted";
  const detail = {
    event: "step_up_missing",
    governanceAction: context.action,
    targetId: context.targetId ?? null,
    mode: "warn",
    reason,
    passkeyAssertedAt: user.passkeyAssertedAt ? user.passkeyAssertedAt.toISOString() : null,
    maxAgeSeconds,
  };

  if (!organizationId) {
    // ConfigAudit rows belong to a tenant. Every route passes the acted-on
    // row's tenant when the actor may have none, so this is a missed call
    // site, and it is said out loud rather than dropped.
    console.warn("[step-up] step-up missing with no tenant to record it under", {
      actorId: user.id,
      ...detail,
    });
    return;
  }

  await writeConfigAudit({
    organizationId,
    actorId: user.id,
    entityType: "StepUp",
    entityId: context.action,
    action: "STEP_UP_MISSING",
    after: detail,
  });
}

/**
 * What the console banner should say to this person, or null for nothing.
 *
 * warn: everyone who can act hears that the requirement is coming, worded by
 * whether they have a passkey yet. enforce: only those without one, because
 * they are the people about to be refused. off: nobody.
 */
export function stepUpBannerState(
  user: Pick<SessionUser, "role" | "hasWebAuthn">,
  mode: StepUpMode = stepUpMode(),
): { mode: "warn" | "enforce"; hasPasskey: boolean } | null {
  if (mode === "off") return null;
  if (!canPerformGovernanceActions(user.role)) return null;
  if (mode === "enforce" && user.hasWebAuthn) return null;
  return { mode, hasPasskey: user.hasWebAuthn };
}
