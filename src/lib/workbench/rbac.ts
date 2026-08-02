/**
 * Who may enter Affirm and Process Discovery, and what they may do there.
 *
 * BOTH WORKSPACES HAD NO ROLE GATE AT ALL. The (workbench) layout checks for a
 * session and nothing else, so every role in the platform — including `viewer`,
 * which holds no privilege anywhere else — could open them.
 *
 * WHAT THIS IS AND IS NOT FIXING. Ownership scoping landed first and was the
 * larger half: a consultant now sees only their own bundles and engagements, so
 * an unauthorised reader no longer reads somebody else's client data. What
 * scoping cannot address is CREATION. A viewer could still start a bundle and
 * email an external executive a link to a client's unreleased Fit-to-Standard
 * decisions, because nothing asked whether creating was theirs to do. That is
 * what an entry predicate plus an action matrix is for.
 *
 * MODELLED ON `src/lib/presales/rbac.ts`, deliberately. Presales is the one
 * workspace that already had both halves, it has been in production, and a
 * second shape for the same idea would be a third thing to keep in agreement.
 * The action lists differ because the workspaces differ; the structure does not.
 *
 * THE MATRIX IS NOT THE ENFORCEMENT. A predicate is a claim until something
 * calls it. The layouts call it for entry, and the routes that create or mutate
 * call it before they write — a gate that only exists in the UI is a form hint,
 * which this codebase already says in `lib/studio/solutions.ts`.
 */

import { isAdminRole } from "@/lib/auth/permissions";

/* ─────────────────────────────────── Affirm ─────────────────────────────── */

export type AffirmAction =
  | "view"
  /** Start a bundle. The action that made the missing gate matter. */
  | "create_bundle"
  | "edit_scope"
  | "edit_questions"
  /** Send it to the client — and, with it, mint external access. */
  | "issue_bundle"
  /** Invite an external executive to read the client's decisions. */
  | "invite_executive"
  | "revoke_grant"
  | "release_bundle";

/* ────────────────────────────────── Discovery ───────────────────────────── */

export type DiscoveryAction =
  | "view"
  | "create_engagement"
  | "run_session"
  /** Record raw client material, pre-anonymisation. */
  | "capture"
  | "curate_library"
  | "export_pack";

/**
 * The three roles that do the work, and the two that watch.
 *
 * `consultant`, `partner_lead` and `platform_admin` are the same three Presales
 * grants everything to; `executive_sponsor` and `project_manager` are the same
 * two it admits read-only. Following that split rather than inventing a second
 * one means a role's reach is the same story across the Workbench.
 */
const FULL = [
  "consultant",
  "partner_lead",
  "platform_admin",
] as const;

const READ_ONLY = ["executive_sponsor", "project_manager"] as const;

const AFFIRM_FULL: ReadonlySet<AffirmAction> = new Set<AffirmAction>([
  "view",
  "create_bundle",
  "edit_scope",
  "edit_questions",
  "issue_bundle",
  "invite_executive",
  "revoke_grant",
  "release_bundle",
]);

const DISCOVERY_FULL: ReadonlySet<DiscoveryAction> = new Set<DiscoveryAction>([
  "view",
  "create_engagement",
  "run_session",
  "capture",
  "curate_library",
  "export_pack",
]);

const VIEW_ONLY_AFFIRM: ReadonlySet<AffirmAction> = new Set<AffirmAction>(["view"]);
const VIEW_ONLY_DISCOVERY: ReadonlySet<DiscoveryAction> = new Set<DiscoveryAction>(["view"]);

function tier(role: string | null | undefined): "full" | "read" | "none" {
  if (!role) return "none";
  // isAdminRole is platform_admin only; it is already in FULL, and naming it
  // here as well would make the list look like it might not be.
  if ((FULL as readonly string[]).includes(role)) return "full";
  if ((READ_ONLY as readonly string[]).includes(role)) return "read";
  return "none";
}

/** May this role open Affirm at all? */
export function canAccessAffirm(role: string | null | undefined): boolean {
  return tier(role) !== "none";
}

/** May this role open Process Discovery at all? */
export function canAccessDiscovery(role: string | null | undefined): boolean {
  return tier(role) !== "none";
}

export function canPerformAffirmAction(
  role: string | null | undefined,
  action: AffirmAction,
): boolean {
  const t = tier(role);
  if (t === "none") return false;
  return (t === "full" ? AFFIRM_FULL : VIEW_ONLY_AFFIRM).has(action);
}

export function canPerformDiscoveryAction(
  role: string | null | undefined,
  action: DiscoveryAction,
): boolean {
  const t = tier(role);
  if (t === "none") return false;
  return (t === "full" ? DISCOVERY_FULL : VIEW_ONLY_DISCOVERY).has(action);
}

/**
 * Read-only in the Workbench — shown as a state, not discovered by clicking.
 *
 * Presales disables its "New bundle" control with a "View only" note for these
 * roles rather than letting the button fail. Same reasoning here.
 */
export function isWorkbenchReadOnlyRole(role: string | null | undefined): boolean {
  return tier(role) === "read";
}

/** Sanity: an admin is never accidentally excluded by a list edit. */
export function assertAdminHasFullReach(): boolean {
  return (
    isAdminRole("platform_admin") &&
    canPerformAffirmAction("platform_admin", "create_bundle") &&
    canPerformDiscoveryAction("platform_admin", "create_engagement")
  );
}
