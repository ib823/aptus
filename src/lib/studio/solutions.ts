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
