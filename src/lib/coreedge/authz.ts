import { isAdminRole } from "@/lib/auth/permissions";

/**
 * Who may act in the CoreEdge console.
 *
 * WHY THIS FILE EXISTS RATHER THAN A REUSE. `canMutateStudio` is the builder's
 * capability and `platform_admin` is deliberately false there — rbac.ts says so
 * out loud, and `canMutateControlTower` was added as "a NEW capability rather
 * than a re-use" for precisely this reason. CoreEdge's decisions are its own
 * (D4 in particular), so they get their own named capabilities rather than a
 * widened Studio gate. Widening `canMutateStudio` to satisfy a console decision
 * would change Studio's security posture to fix a CoreEdge problem.
 *
 * "REVIEWER" AND "OPERATOR" ARE NOT ROLES IN THIS REPOSITORY. `UserRole` has no
 * such members. The design's reviewer is a CONSTRAINT — requester ≠ decider —
 * and its operator is the support persona, who watches and never changes. So
 * the design's sentences are translated here, once, with the translation
 * written down rather than left implicit at each call site.
 *
 * EVERY ANSWER IS A REASON, NOT A BOOLEAN, where the screen must explain a
 * refusal. The console's contract is that a blocked control keeps its reason
 * and its tab stop; a bare `false` gives a caller nothing to render and invites
 * each screen to invent its own sentence — which is how two screens end up
 * saying the same rule in different words.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * The personas, translated
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The builder. Raises requests and builds apps; reviews a colleague's request.
 * `consultant` is the same role Studio calls its builder.
 */
function isBuilder(role: string | null | undefined): boolean {
  return role === "consultant";
}

/**
 * The operations persona — support. Watches the running system and changes
 * nothing about it. D4: an operator flags and notifies, never revokes.
 */
export function isOperator(role: string | null | undefined): boolean {
  return role === "support";
}

/** Platform admin, which in this repository is exactly one role value. */
export function isPlatformAdmin(role: string | null | undefined): boolean {
  // `isAdminRole` takes a string; an absent role is simply not an admin.
  return role !== null && role !== undefined && isAdminRole(role);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The verbs
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A refusal a screen can render, or null when the action is permitted.
 *
 * The string is a DISABLED_REASONS value chosen by the caller; this module
 * returns the KEY so copy stays in copy.ts and one rule cannot acquire two
 * wordings.
 */
export type CoreEdgeRefusal =
  | "noPermission"
  | "platformAdminOnly"
  | "revokeNotOperator"
  | "ownRequest"
  | "ownApp"
  | "missingExpiry";

export interface DecideInput {
  readonly role: string | null | undefined;
  readonly userId: string;
  /** Who raised it. Null when the requester is no longer known. */
  readonly requestedById: string | null;
  /** The grant's own end date. Access is never approved without one. */
  readonly expiresAt: Date | null;
}

/**
 * May this person decide this request?
 *
 * THE ORDER IS THE ARGUMENT. Role first, because someone who cannot decide at
 * all should not be told about the end date; then self-approval, which is about
 * this person; then the missing expiry, which is about the request and is the
 * one a permitted reviewer can actually fix.
 *
 * The same three rules are enforced again inside `evaluateDecision`, which is
 * the authority. This is the console's copy for rendering a reason BEFORE the
 * click — never instead of the check.
 */
export function refuseDecision(input: DecideInput): CoreEdgeRefusal | null {
  if (!isPlatformAdmin(input.role) && !isBuilder(input.role)) return "noPermission";
  if (input.requestedById !== null && input.requestedById === input.userId) return "ownRequest";
  if (input.expiresAt === null) return "missingExpiry";
  return null;
}

/**
 * May this person revoke a key? D4, settled: a platform admin or a reviewer.
 *
 * An operator is refused with the sentence that says what they do instead. The
 * screen goes further and does not render the control for them at all — a
 * destructive action nobody may take is not a disabled control, it is not that
 * person's control — but the refusal is still returned here so the route can
 * enforce the same rule the screen renders.
 */
export function refuseRevokeKey(role: string | null | undefined): CoreEdgeRefusal | null {
  if (isOperator(role)) return "revokeNotOperator";
  if (!isPlatformAdmin(role) && !isBuilder(role)) return "noPermission";
  return null;
}

/**
 * May this person send a claim link?
 *
 * The same people who decide a request: sending the key is the step that
 * follows an approval, and splitting the two would let someone approve access
 * they cannot then deliver.
 */
export function refuseSendClaimLink(role: string | null | undefined): CoreEdgeRefusal | null {
  if (!isPlatformAdmin(role) && !isBuilder(role)) return "noPermission";
  return null;
}

/**
 * May this person re-check a lane now?
 *
 * WIDER THAN THE OTHERS, on purpose. A re-check writes no governance state: it
 * asks SAP a question this product already asks nightly and records what came
 * back. An operator watching a board is exactly who needs it, and refusing them
 * would leave the person most likely to be looking at a stale lane unable to
 * refresh it. Rate limiting, not role, is what stops it being abused.
 */
export function refuseRecheck(role: string | null | undefined): CoreEdgeRefusal | null {
  if (!isPlatformAdmin(role) && !isBuilder(role) && !isOperator(role)) return "noPermission";
  return null;
}
