/**
 * The CoreEdge Console manual.
 *
 * WHY THIS FILE IS SHAPED THE WAY IT IS. A manual is a second surface that can
 * disagree with the product, and it is the surface people trust most — so it is
 * the easiest place to introduce exactly the drift this codebase has spent its
 * whole history removing. A screen that says "empty is not healthy" beside a
 * manual that says "shows your system health" is worse than no manual.
 *
 * So the structural facts are DERIVED, never restated:
 *
 *   · the screen inventory comes from the rail's own section lists
 *   · workspace names and purposes come from WORKSPACES
 *   · who can open what is computed from the real RBAC predicates, over the
 *     real role list — not from a table someone maintains here
 *
 * What is hand-written is the part that genuinely cannot be derived: what a
 * screen is FOR, and what it deliberately refuses to tell you. Those are
 * judgements, and they are kept in one place so a test can assert every screen
 * has them. A screen shipping undocumented is the same defect class as a rail
 * entry pointing at a 404 — and it is caught the same way.
 */

import {
  CONTROL_TOWER_SECTIONS,
  OPERATIONS_SECTIONS,
  STUDIO_SECTIONS,
  type StudioSection,
} from "@/lib/studio/sections";
import { INCIDENT_RULES, INCIDENT_THRESHOLDS } from "@/lib/ops/incidents";
import {
  WORKSPACES,
  canAccessControlTower,
  canAccessOperations,
  canAccessStudio,
  canMutateControlTower,
  canMutateStudio,
  type StudioWorkspace,
} from "@/lib/studio/rbac";
import { ALL_USER_ROLES, ROLE_LABELS, type UserRole } from "@/types/assessment";

/** The prose a screen needs and nothing can compute for it. */
interface ScreenProse {
  /** The question this screen exists to answer, in one sentence. */
  answers: string;
  /**
   * What it deliberately does NOT establish.
   *
   * The most important field in this file. Every Console screen refuses to
   * claim something, and a reader who does not know which thing will read the
   * refusal as a gap in the product rather than a property of the data.
   */
  cannotTell: readonly string[];
  /** Things a first-time reader gets wrong. Optional, but usually the payoff. */
  misreadings?: readonly { seeing: string; means: string }[];
}

/**
 * Hand-written prose, keyed by `workspace/sectionKey`.
 *
 * Every key here must exist in a rail section list, and every rail section must
 * have a key here. Both directions are asserted — a screen added without an
 * entry fails, and an entry left behind after a screen is removed fails too.
 */
const PROSE: Record<string, ScreenProse> = {
  /* ─────────────────────────── Developer Studio ─────────────────────────── */

  "developer-studio/home": {
    answers: "Where a builder starts: what this organization has registered, and what to do next.",
    cannotTell: ["Whether anything is currently reaching SAP — that is the Operations Center."],
  },
  "developer-studio/solutions": {
    answers:
      "Register a solution, claim accountability for it, and issue its runtime credential.",
    cannotTell: [
      "Who else could be an owner. Ownership is claimed, never assigned — you can only put yourself in a slot.",
    ],
    misreadings: [
      {
        seeing: "No user picker beside an owner slot",
        means:
          "Not a missing feature. Accountability you did not accept is not accountability, and if you could name three colleagues you could then issue the credential alone — which is the exact two-person rule the slots exist to enforce.",
      },
      {
        seeing: "Issue credential is disabled on a solution you own",
        means:
          "Working as designed. The person who owns a solution cannot issue its credential; ask a colleague. The refusal is what makes the audit record worth reading.",
      },
    ],
  },
  "developer-studio/discover": {
    answers: "Browse the SAP catalogue and turn a service into an interface this solution can call.",
    cannotTell: [
      "Whether the service will actually work for you — discovery reads the catalogue, not your tenant's activation state.",
    ],
  },
  "developer-studio/interfaces": {
    answers: "The capabilities a solution has declared, and the entity set each one reads.",
    cannotTell: ["Whether a capability is permitted — that is decided in Access, and enforced per call."],
    misreadings: [
      {
        seeing: "An interface with no entity set",
        means:
          "The broker will refuse the read with a 400. Set one here; the advice in the error is followable from this screen.",
      },
    ],
  },
  "developer-studio/connections": {
    answers: "The SAP connections this organization has stored, and whether each one answers.",
    cannotTell: [
      "The secret behind a connection. It is sealed at rest and never read by any screen — the console genuinely cannot show it.",
    ],
    misreadings: [
      {
        seeing: "A connection with no environment",
        means:
          "Reads through it are served but marked unverified; writes are refused outright. Declaring the environment is the whole fix.",
      },
    ],
  },
  "developer-studio/access": {
    answers: "Request permission for a capability, and see what has been decided.",
    cannotTell: [
      "When a decision will be made. Deciding happens in Control Tower, and the requester may never be the approver.",
    ],
    misreadings: [
      {
        seeing: "A write request refused for having no expiry",
        means:
          "There is no revocation in this release, so a write grant that never ends could never be ended. The expiry is the control that replaces revocation.",
      },
    ],
  },
  "developer-studio/test": {
    answers: "Call a capability for real, against the connection this solution would actually use.",
    cannotTell: ["Anything about other solutions' traffic — this is your own call, made now."],
  },

  /* ────────────────────────── Operations Center ─────────────────────────── */

  "operations-center/home": {
    answers: "Where an operator starts, and what each Operations screen is for.",
    cannotTell: [
      "A fleet summary. Every number worth showing has an authoritative screen one click away, and a copy of a number is a thing that disagrees with it.",
    ],
  },
  "operations-center/traffic": {
    answers: "Every northbound call this organization made, as the audit trail recorded it.",
    cannotTell: [
      "Calls throttled at the edge — they persist no record at all.",
      "Calls that hit a platform timeout before the audit write.",
      "Calls whose audit write itself failed, which means the feed thins exactly when the database is struggling.",
    ],
    misreadings: [
      {
        seeing: "A median latency figure",
        means:
          "It is computed over the returned page, not the window, and the line beneath it says over how many. A median over 40 rows and one over 4,000 are different claims.",
      },
      {
        seeing: '"No connection reached" in the binding row',
        means:
          "Those calls were refused at authentication, the throttle or the grant gate. No connection was involved, so there was no binding to agree or disagree — it is not a failure of binding.",
      },
    ],
  },
  "operations-center/connections": {
    answers: "Whether each SAP connection is answering, and whether its landscape is known.",
    cannotTell: [
      "The health of a deployment fallback tenant. Probe outcomes are stored per connection; a shared tenant has no row to record one against.",
      "Anything about deactivated connections — they serve no traffic, so their last probe would be a stale claim.",
    ],
    misreadings: [
      {
        seeing: "A healthy connection marked binding unverified",
        means:
          "Two independent questions. It answers perfectly; what is unknown is which landscape it is. Fixing the second does not involve touching the first.",
      },
      {
        seeing: "TIMEOUT beside a three-week-old last-succeeded date",
        means:
          "The truth, not an inconsistency. The timestamp moves only on a real success, so it records when the connection last actually worked.",
      },
    ],
  },
  "operations-center/incidents": {
    answers: "What crossed a threshold, and the named rule that judged it.",
    cannotTell: [
      "That everything is well. An empty list means nothing crossed a threshold in what the audit feed recorded — and the feed is a floor, not a census.",
    ],
    misreadings: [
      {
        seeing: "An empty incident list",
        means:
          "Nothing fired. That is a weaker statement than health, and deliberately so — the screen lists every rule being watched precisely so an empty result can be checked rather than trusted.",
      },
    ],
  },
  "operations-center/writes": {
    answers: "Write reservations, and the writes that were refused before one was made.",
    cannotTell: [
      "A single reconciled total. The two panels count different things — row states and audit events — and will not add up.",
    ],
    misreadings: [
      {
        seeing: "A completely empty ledger",
        means:
          "By design in this release: no write credential can be issued yet, so every write is refused at the credential gate before a key is reserved. It is a control working, not a screen failing.",
      },
    ],
  },
  "operations-center/throttle": {
    answers: "How much of each rate-limit budget is left, read without spending any of it.",
    cannotTell: [
      "Usage of the two IP-keyed buckets. They fire before the route runs and are keyed by an address that cannot be enumerated — their limit is knowable, their usage never is.",
    ],
    misreadings: [
      {
        seeing: "An em-dash where a number should be",
        means:
          "Not loading and not zero. That bucket's usage cannot be observed at all, permanently — a figure there would be invented.",
      },
    ],
  },
  "operations-center/tokens": {
    answers: "The runtime credentials issued for this organization, and their state.",
    cannotTell: [
      "Whether a credential is dormant. Last-observed use is written fire-and-forget and often does not land, so a blank is an absent observation rather than an absent call.",
    ],
    misreadings: [
      {
        seeing: "Counts that do not sum",
        means:
          "Revoked is counted over every credential; the rest are counted over the rows listed, which exclude revoked ones by default. The response says so rather than reconciling them into one wrong number.",
      },
    ],
  },

  /* ─────────────────────────── Control Tower ────────────────────────────── */

  "control-tower/home": {
    answers: "Where a reviewer starts, and what can and cannot be done from this workspace.",
    cannotTell: ["Whether anything is failing right now — that is the Operations Center."],
  },
  "control-tower/portfolio": {
    answers: "Every registered solution, and whether anyone is accountable for it.",
    cannotTell: [
      "Anything enforced by the declared data class. It is free text recorded at registration; nothing in the platform reads it and no gate depends on it.",
    ],
    misreadings: [
      {
        seeing: "A solution missing owners",
        means:
          "It cannot be promoted to ACTIVE and cannot be issued a credential. The screen names which slots are empty so the right person can be asked.",
      },
    ],
  },
  "control-tower/grants": {
    answers: "What was asked for, what was decided, and when that decision stops being true.",
    cannotTell: [
      "How to revoke a grant. There is no revocation in this release — an approved grant ends only by lapsing.",
    ],
    misreadings: [
      {
        seeing: "A decision labelled SANDBOX_ONLY that authorises nothing",
        means:
          "The label is not the permission. On a PROD grant, sandbox-only permits no call at all — the Authorises column is computed with the same predicates the broker enforces with.",
      },
      {
        seeing: "A settled grant marked unbounded",
        means:
          "A defect, not a state. It has no expiry and cannot be re-decided, so nothing will ever end it. It needs a new, bounded request to replace it.",
      },
    ],
  },
  "control-tower/audit": {
    answers: "Every change to governed configuration — who made it, and when.",
    cannotTell: [
      "What a change contained. The before and after snapshots are stored and deliberately not returned; they hold whole entity records this view has no business projecting.",
      "Anything about reads. This records configuration, not activity.",
    ],
  },
  "control-tower/connections": {
    answers: "The whole SAP estate, active or not, and who may write through each connection.",
    cannotTell: [
      "Live probe health in context — this is the governance register; whether a connection is answering right now is the Operations Center.",
    ],
    misreadings: [
      {
        seeing: "Deactivated connections listed here but not in Operations",
        means:
          "Deliberate. A deactivated connection has no health worth reporting and is still part of the estate someone is accountable for.",
      },
    ],
  },
  "control-tower/tokens": {
    answers: "Every runtime credential, and whether issuing it was accountable.",
    cannotTell: [
      "Whether segregation held for a solution outside your scope. That reads unknowable, which is not the same as passing.",
    ],
    misreadings: [
      {
        seeing: "Rotate or revoke, disabled",
        means:
          "A real capability that belongs to the builder in Developer Studio. It is shown rather than hidden so a reviewer knows it exists and who holds it.",
      },
      {
        seeing: "Issued by an owner, non-zero",
        means:
          "A control that did not hold for that row. Issuance refuses an owner, so this should be zero and a non-zero is worth investigating rather than dismissing.",
      },
    ],
  },
};

export interface ManualScreen {
  /** `operations-center/incidents` — the manual's own URL segment. */
  slug: string;
  workspace: StudioWorkspace;
  workspaceLabel: string;
  sectionKey: string;
  title: string;
  /** The real screen this documents. Null when it is not built yet. */
  href: string | null;
  available: boolean;
  answers: string;
  cannotTell: readonly string[];
  misreadings: readonly { seeing: string; means: string }[];
  /** Computed from the real predicates — never a maintained list. */
  openTo: readonly string[];
}

const SECTION_LISTS: Record<StudioWorkspace, readonly StudioSection[]> = {
  "developer-studio": STUDIO_SECTIONS,
  "operations-center": OPERATIONS_SECTIONS,
  "control-tower": CONTROL_TOWER_SECTIONS,
};

/** Roles that may open a workspace, computed over the real role list. */
function rolesFor(workspace: StudioWorkspace): string[] {
  const predicate =
    workspace === "developer-studio"
      ? canAccessStudio
      : workspace === "operations-center"
        ? canAccessOperations
        : canAccessControlTower;
  return ALL_USER_ROLES.filter((r) => predicate(r)).map((r) => ROLE_LABELS[r as UserRole]);
}

/** The whole manual, assembled from the rail plus the prose above. */
export const MANUAL: readonly ManualScreen[] = WORKSPACES.flatMap((w) =>
  SECTION_LISTS[w.key].map((section): ManualScreen => {
    const slug = `${w.key}/${section.key}`;
    const prose = PROSE[slug];
    return {
      slug,
      workspace: w.key,
      workspaceLabel: w.label,
      sectionKey: section.key,
      title: section.label,
      href: section.available ? section.href : null,
      available: section.available,
      // A missing entry is caught by the completeness test rather than papered
      // over here — an empty string in the UI would read as "nothing to say".
      answers: prose?.answers ?? "",
      cannotTell: prose?.cannotTell ?? [],
      misreadings: prose?.misreadings ?? [],
      openTo: rolesFor(w.key),
    };
  }),
);

/** Every prose key, so a stale entry can be detected as well as a missing one. */
export const PROSE_KEYS: readonly string[] = Object.keys(PROSE);

export function manualScreen(slug: string): ManualScreen | null {
  return MANUAL.find((m) => m.slug === slug) ?? null;
}

/**
 * The manual page for a screen you are looking at.
 *
 * Longest match wins, so `/operations/connections` resolves to its own entry
 * rather than to `/operations`. Returns null off the Console entirely, which is
 * how the contextual help control knows to hide rather than to guess.
 */
export function manualSlugForPath(pathname: string): string | null {
  let best: ManualScreen | null = null;
  for (const screen of MANUAL) {
    if (!screen.href) continue;
    if (pathname === screen.href || pathname.startsWith(`${screen.href}/`)) {
      if (!best || screen.href.length > (best.href?.length ?? 0)) best = screen;
    }
  }
  return best?.slug ?? null;
}

/** What each workspace is for — from the descriptors, not restated. */
export const WORKSPACE_OVERVIEWS = WORKSPACES.map((w) => ({
  key: w.key,
  label: w.label,
  purpose: w.purpose,
  openTo: rolesFor(w.key),
  /** Whether a governance mutation is possible here at all, and by whom. */
  mutations:
    w.key === "developer-studio"
      ? { possible: true, by: ALL_USER_ROLES.filter((r) => canMutateStudio(r)).map((r) => ROLE_LABELS[r as UserRole]) }
      : w.key === "control-tower"
        ? { possible: true, by: ALL_USER_ROLES.filter((r) => canMutateControlTower(r)).map((r) => ROLE_LABELS[r as UserRole]) }
        : { possible: false, by: [] as string[] },
  screens: MANUAL.filter((m) => m.workspace === w.key),
}));

/**
 * The incident rules, rendered from the constants the endpoint scores with.
 *
 * Not a copy. If a threshold changes, this page changes with it — which is the
 * whole reason severities were made named constants rather than inline checks.
 */
export const INCIDENT_REFERENCE = Object.values(INCIDENT_RULES).map((rule) => ({
  id: rule.id,
  severity: rule.severity,
  title: rule.title,
  firesWhen: rule.firesWhen,
  whyThisSeverity: rule.whyThisSeverity,
  remediation: rule.remediation,
}));

export { INCIDENT_THRESHOLDS };
