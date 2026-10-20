/**
 * Solution status and the ownership gate.
 *
 * A solution is a passport: it says what is being built, for which business
 * problem, and — critically — who is accountable for it. The ownership gate is
 * the rule that keeps that last part honest.
 *
 * THE GATE IS A SERVER RULE, NOT A FORM HINT. A gate that only exists in the UI
 * is one API call away from being bypassed, and the thing it protects against is
 * not a careless click: it is an ACTIVE solution touching a client's SAP system
 * with nobody named to answer for it. So the transition is computed here, on
 * every write, from the state being saved.
 *
 * Two directions, both enforced:
 *   - You cannot promote to ACTIVE without all three owners.
 *   - An already-ACTIVE solution that LOSES an owner drops to RESTRICTED on the
 *     same save. Ownership decays quietly — people leave projects — and a
 *     solution that silently stayed ACTIVE with a null owner is exactly the
 *     orphan the gate exists to catch.
 */

export type SolutionStatus = "DRAFT" | "ACTIVE" | "RESTRICTED" | "RETIRED";

export interface Ownership {
  technicalOwnerId: string | null;
  businessOwnerId: string | null;
  supportOwnerId: string | null;
}

/** All three roles must be named. Accountability with a gap is not accountability. */
export function hasCompleteOwnership(o: Ownership): boolean {
  return Boolean(o.technicalOwnerId && o.businessOwnerId && o.supportOwnerId);
}

/** Which owner roles are missing — so the UI can say precisely what is needed. */
export function missingOwners(o: Ownership): string[] {
  const missing: string[] = [];
  if (!o.technicalOwnerId) missing.push("technical owner");
  if (!o.businessOwnerId) missing.push("business owner");
  if (!o.supportOwnerId) missing.push("support owner");
  return missing;
}

/** The three accountability slots, in the order the UI shows them. */
export const OWNER_FIELDS = ["technicalOwnerId", "businessOwnerId", "supportOwnerId"] as const;
export type OwnerField = (typeof OWNER_FIELDS)[number];

/**
 * OWNERSHIP IS CLAIMED, NEVER ASSIGNED — and this is a security control, not a
 * UI convention.
 *
 * WHAT BREAKS WITHOUT IT. Issuing a runtime credential requires all three
 * owners set AND refuses anyone who is themselves an owner
 * (`clients/route.ts`). That pair is a two-human rule: somebody accepts
 * accountability, somebody else issues.
 *
 * If a consultant may write an arbitrary id into an owner slot, they name three
 * colleagues who did nothing and know nothing, are not themselves an owner, and
 * issue the credential alone. The two-human rule becomes a one-human rule with
 * three unwitting names attached — and the audit record now reads as though
 * three people accepted accountability, which is worse than having no owner
 * field at all. The route's own comment says the record "is what makes issuing
 * it reviewable"; a record you can populate unilaterally is not reviewable.
 *
 * WHAT IS STILL ALLOWED, DELIBERATELY:
 *
 *   - Claiming a slot for yourself.
 *   - CLEARING any slot, including someone else's. That is how a departed
 *     owner's slot is recovered: a colleague clears it, someone else claims it,
 *     and accountability lands on a person who accepted it. Clearing is safe
 *     because it never makes anyone accountable — it makes the solution
 *     visibly unowned, which auto-drops an ACTIVE solution to RESTRICTED and is
 *     written to the config audit. (Stepping down from your own LAST slot waits
 *     while an access request awaits a decision — see
 *     OWNER_RELEASE_WHILE_PENDING — and claiming has its own limit,
 *     OWNER_CLAIM_BY_DECIDER. Both are about who decides, not who is named, so
 *     they are applied by the route beside this rule.)
 *
 * So the rule is exactly: an owner id may be your own, or null. Nothing else.
 */
export function rejectedOwnerAssignments(
  requested: Partial<Record<OwnerField, string | null | undefined>>,
  callerId: string,
): OwnerField[] {
  return OWNER_FIELDS.filter((field) => {
    const value = requested[field];
    // undefined = not mentioned in this request; null = released.
    if (value === undefined || value === null) return false;
    return value !== callerId;
  });
}

/** The refusal a caller sees, naming the remedy rather than just the rule. */
export function ownerAssignmentRefusal(fields: readonly OwnerField[]): string {
  const labels: Record<OwnerField, string> = {
    technicalOwnerId: "technical owner",
    businessOwnerId: "business owner",
    supportOwnerId: "support owner",
  };
  const named = fields.map((f) => labels[f]).join(", ");
  return (
    `You cannot assign someone else as ${named}. Accountability is claimed, not delegated — ` +
    "ask them to claim the slot themselves. You can clear a slot that is no longer correct."
  );
}

/**
 * Does this save turn the caller from an owner into a non-owner — holding a
 * slot before it, and none after?
 *
 * That is the only slot change that hands the CALLER a decision OWN_APP would
 * have refused them. Clearing a departed owner's slot, clearing or claiming
 * over a colleague's, or moving between slots all leave the caller exactly as
 * visible to OWN_APP as they were, so none of them is asked about here.
 */
export function stepsCallerDown(current: Ownership, next: Ownership, callerId: string): boolean {
  const holdsASlot = (o: Ownership) => OWNER_FIELDS.some((field) => o[field] === callerId);
  return holdsASlot(current) && !holdsASlot(next);
}

/** The slots this save gives the caller that they did not already hold. */
export function claimedOwnerSlots(current: Ownership, next: Ownership, callerId: string): OwnerField[] {
  return OWNER_FIELDS.filter((field) => next[field] === callerId && current[field] !== callerId);
}

/**
 * OWN_APP MUST HOLD ACROSS OWNERSHIP CHANGES, not only at the instant of a
 * decision. `evaluateDecision` compares the decider with the owners the row
 * holds when the decision is made, and both halves of a slot change are
 * self-service — so an owner could release their slots, approve their own
 * app's PROD write as a "non-owner", and claim the slots straight back, ending
 * as both the decider and the owner of the grant. The two refusals below close
 * one half each, on the save that would open it. Both are checked under the
 * Solution row lock every decision route also takes (lib/studio/owner-lock.ts),
 * so a decision and a slot change fired together cannot each pass on what the
 * other has not yet written.
 *
 * While a request awaits a decision, an owner may not step down from their
 * LAST slot (`stepsCallerDown`): whoever owned the app when access was asked
 * for still owns it when the access is decided, so OWN_APP sees them.
 * Everything else stays open while the request waits — clearing a departed
 * owner's slot, clearing or claiming over a colleague's, moving between slots,
 * claiming an empty one — because none of it makes the caller a non-owner. A
 * colleague who has been cleared and then decides is a second person acting,
 * not the self-service path, and OWNER_CLAIM_BY_DECIDER still keeps them from
 * claiming the slot back while their decision is live.
 */
export const OWNER_RELEASE_WHILE_PENDING =
  "This app has an access request waiting for a decision, so you can't step down from your last owner slot until it is decided — " +
  "otherwise an owner could step down, decide their own app's access, and step back. " +
  "Ask a colleague who doesn't own the app to decide the request first.";

/**
 * Nobody may claim a slot on an app whose live access they decided. An approval
 * given as a non-owner stays a non-owner's approval for as long as it
 * authorises anything; once it has lapsed or been revoked it authorises
 * nothing, and the slot can be claimed.
 *
 * REJECTIONS ARE EXEMPT, DELIBERATELY. A rejection authorises nothing, so
 * owning an app whose request you rejected is no escalation: there is no live
 * access for the new owner to be sitting on, and the requester can raise the
 * request again, to be decided under OWN_APP like any other. So release →
 * reject → reclaim is allowed. This is narrower than OWN_APP at the moment of
 * deciding, which refuses an owner's rejection too (see `evaluateDecision`):
 * that rule is about who may settle a request, this one about what a past
 * settlement still grants its decider.
 */
export const OWNER_CLAIM_BY_DECIDER =
  "You decided access for this app that is still live, so you can't become one of its owners — " +
  "an app's owner may not approve its access. Ask a colleague to claim the slot, or claim it once that access has ended.";

export type StatusResolution =
  | { status: SolutionStatus; autoDropped: false }
  | { status: "RESTRICTED"; autoDropped: true; reason: string };

export type PromotionRefusal = { ok: false; reason: string };
export type PromotionOutcome = { ok: true } | PromotionRefusal;

/**
 * May this solution be promoted to ACTIVE with this ownership?
 * Refuses rather than silently downgrading, because a promotion that quietly
 * did not happen is worse than one that was clearly declined.
 */
export function evaluatePromotion(o: Ownership): PromotionOutcome {
  if (hasCompleteOwnership(o)) return { ok: true };
  const missing = missingOwners(o);
  return {
    ok: false,
    reason: `A solution cannot be ACTIVE without all three owners. Missing: ${missing.join(", ")}.`,
  };
}

/**
 * The status a save should actually persist.
 *
 * `requested` is what the caller asked for (or the current status, if they did
 * not ask to change it). The rule:
 *   - ACTIVE + incomplete ownership → caller is promoting: that is refused
 *     upstream by evaluatePromotion, so reaching here means the solution was
 *     ALREADY active and has just lost an owner → auto-drop to RESTRICTED.
 *   - Anything else → as requested.
 *
 * RETIRED and DRAFT are untouched by ownership: a retired solution with no
 * owners is not a problem, it is a finished thing, and forcing owners onto a
 * draft would make the gate an obstacle to starting work rather than a control
 * on shipping it.
 */
export function resolveStatusOnSave(requested: SolutionStatus, o: Ownership): StatusResolution {
  if (requested === "ACTIVE" && !hasCompleteOwnership(o)) {
    return {
      status: "RESTRICTED",
      autoDropped: true,
      reason: `Ownership is incomplete (missing: ${missingOwners(o).join(", ")}), so this solution was moved to RESTRICTED.`,
    };
  }
  return { status: requested, autoDropped: false };
}

/**
 * Would saving this change orphan an ACTIVE solution?
 * Used to decide whether the caller is promoting (refuse) or degrading an
 * existing ACTIVE row (auto-drop) — the two need different treatment.
 */
export function isOrphaningAnActiveSolution(
  currentStatus: SolutionStatus,
  requested: SolutionStatus,
  nextOwnership: Ownership,
): boolean {
  return currentStatus === "ACTIVE" && requested === "ACTIVE" && !hasCompleteOwnership(nextOwnership);
}

/**
 * URL-safe slug from a name. Deliberately conservative: lowercase, alphanumeric
 * and single hyphens only, so a slug is always safe in a path and stable to read.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
