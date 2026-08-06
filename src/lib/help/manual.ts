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
import {
  WORKBENCH_PROSE_KEYS,
  WORKBENCH_WORKSPACES,
  type WorkbenchWorkspace,
} from "@/lib/help/workbench-manual";
import { canPerformPresalesAction } from "@/lib/presales/rbac";

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
          "A grant with no end date is standing access that nobody has to review. Revocation exists as an emergency stop, but it needs somebody to notice first — the expiry is what ends the access without anyone having to.",
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
          "No solution in scope performed a write in this window. Writes are live — a write key issued in Developer Studio against an approved write grant, plus a mandatory Idempotency-Key — so an empty ledger is quiet, not disabled. A write refused at any gate before reservation appears in the audit feed, never here.",
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
      "Anything enforced by the declared data class. It is a closed vocabulary now rather than free text, so the values are comparable — but nothing in the platform reads it and no gate depends on it. Rows registered before the list closed read as UNCLASSIFIED, which is what they are.",
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
      "Whether access actually stopped. Revoking a grant closes it here and at the broker's next check; it does not reach into SAP, and it cannot tell you what the holder read while it was live. The traffic feed answers that.",
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
          "A defect, not a state. It has no expiry and cannot be re-decided, so nothing will end it on its own. Revoke it with a reason and raise a fresh, bounded request in its place.",
      },
      {
        seeing: "Revoke available on a grant that is already APPROVED",
        means:
          "Not a re-decision, and it does not overwrite the approval. The decision stands in the ledger and the withdrawal is recorded beside it, because a decision does not un-happen — you are meant to be able to read both.",
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

export type ManualWorkspace = StudioWorkspace | WorkbenchWorkspace;

export interface ManualScreen {
  /** `operations-center/incidents` — the manual's own URL segment. */
  slug: string;
  workspace: ManualWorkspace;
  workspaceLabel: string;
  sectionKey: string;
  title: string;
  /**
   * The real screen this documents, when it has an address.
   *
   * Null for two different reasons, which the reader has to be able to tell
   * apart: a Console screen that is not built yet, and a Workbench stage that
   * exists but lives inside a bundle — /affirm/{bundle}/questions is a shape,
   * not a URL. `available` distinguishes them, and `reachedBy` says how to get
   * to the second kind.
   */
  href: string | null;
  available: boolean;
  /** Directions, when there is no link to give. Null when `href` is set. */
  reachedBy: string | null;
  /** The route as a reader should recognise it, parameters and all. */
  pattern: string;
  answers: string;
  cannotTell: readonly string[];
  misreadings: readonly { seeing: string; means: string }[];
  /** Computed from the real predicates — never a maintained list. */
  openTo: readonly string[];
  /**
   * What that roster MEANS. "role" — a predicate decides. "session" — the only
   * gate is being signed in, so every role is listed because every role really
   * can open it. Printing the same list for both would turn the absence of a
   * control into the appearance of one.
   */
  accessBasis: "role" | "session";
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

/** The Console's twenty screens, assembled from the rail plus the prose above. */
const CONSOLE_MANUAL: readonly ManualScreen[] = WORKSPACES.flatMap((w) =>
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
      reachedBy: null,
      pattern: section.href,
      // A missing entry is caught by the completeness test rather than papered
      // over here — an empty string in the UI would read as "nothing to say".
      answers: prose?.answers ?? "",
      cannotTell: prose?.cannotTell ?? [],
      misreadings: prose?.misreadings ?? [],
      openTo: rolesFor(w.key),
      accessBasis: "role",
    };
  }),
);

/**
 * The Workbench's twenty-two, on the same terms.
 *
 * `available` is true throughout: unlike the Console rail, which flips sections
 * on as their PRs land, every Workbench route documented here is checked against
 * the real route tree by `workbench-routes.test.ts`. A pattern that stopped
 * resolving would fail there rather than render as a link to a 404.
 */
const WORKBENCH_MANUAL: readonly ManualScreen[] = WORKBENCH_WORKSPACES.flatMap((w) =>
  w.sections.map((section): ManualScreen => {
    const slug = `${w.key}/${section.key}`;
    const prose = w.prose[slug];
    return {
      slug,
      workspace: w.key,
      workspaceLabel: w.label,
      sectionKey: section.key,
      title: section.label,
      href: section.href,
      available: true,
      reachedBy: section.reachedBy,
      pattern: section.pattern,
      answers: prose?.answers ?? "",
      cannotTell: prose?.cannotTell ?? [],
      misreadings: prose?.misreadings ?? [],
      openTo: w.openTo,
      accessBasis: w.accessBasis,
    };
  }),
);

/** The whole manual — Console first, because the Workbench pages link into it. */
export const MANUAL: readonly ManualScreen[] = [...CONSOLE_MANUAL, ...WORKBENCH_MANUAL];

/** Every prose key, so a stale entry can be detected as well as a missing one. */
export const PROSE_KEYS: readonly string[] = [
  ...Object.keys(PROSE),
  ...WORKBENCH_PROSE_KEYS,
];

export function manualScreen(slug: string): ManualScreen | null {
  return MANUAL.find((m) => m.slug === slug) ?? null;
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A route pattern as something a pathname can be tested against.
 *
 * Scored by how much of it is LITERAL, which is what stops the parameterised
 * patterns from swallowing their siblings: `/affirm/{bundle}` matches
 * `/affirm/new` perfectly well, and would win on length. It has one literal
 * segment; `/affirm/new` has two, so the real screen wins and the bundle
 * pattern is left for actual bundle ids.
 */
function matcherFor(pattern: string): { re: RegExp; literals: number; segments: number } {
  const segs = pattern.split("/").filter(Boolean);
  return {
    re: new RegExp(
      `^/${segs.map((s) => (s.startsWith("{") ? "[^/]+" : escapeRegex(s))).join("/")}(?:/|$)`,
    ),
    literals: segs.filter((s) => !s.startsWith("{")).length,
    segments: segs.length,
  };
}

const MATCHERS = MANUAL.map((screen) => ({ screen, ...matcherFor(screen.pattern) }));

/**
 * The manual page for a screen you are looking at.
 *
 * Most specific match wins, so `/operations/connections` resolves to its own
 * entry rather than to `/operations`, and `/affirm/abc123/questions` resolves to
 * the question editor rather than to the bundle it belongs to.
 *
 * Returns null off the documented product entirely — the portal, the assessment
 * screens, the external client journey — which is how the contextual help
 * control knows to hide rather than to guess. It used to return null across the
 * whole Workbench too, because there was nothing to point at.
 */
export function manualSlugForPath(pathname: string): string | null {
  let best: (typeof MATCHERS)[number] | null = null;
  for (const m of MATCHERS) {
    if (!m.re.test(pathname)) continue;
    if (
      !best ||
      m.literals > best.literals ||
      (m.literals === best.literals && m.segments > best.segments)
    ) {
      best = m;
    }
  }
  return best?.screen.slug ?? null;
}

export interface WorkspaceOverview {
  key: ManualWorkspace;
  label: string;
  purpose: string;
  openTo: readonly string[];
  accessBasis: "role" | "session";
  /** Whether a change is possible here at all, and by whom. */
  mutations: { possible: boolean; by: readonly string[] };
  /** Which product half this belongs to, so the index can group them. */
  family: "console" | "workbench";
  screens: readonly ManualScreen[];
}

/** What each workspace is for — from the descriptors, not restated. */
const CONSOLE_OVERVIEWS: readonly WorkspaceOverview[] = WORKSPACES.map((w) => ({
  key: w.key as ManualWorkspace,
  label: w.label,
  purpose: w.purpose,
  openTo: rolesFor(w.key),
  accessBasis: "role" as const,
  mutations:
    w.key === "developer-studio"
      ? { possible: true, by: ALL_USER_ROLES.filter((r) => canMutateStudio(r)).map((r) => ROLE_LABELS[r as UserRole]) }
      : w.key === "control-tower"
        ? { possible: true, by: ALL_USER_ROLES.filter((r) => canMutateControlTower(r)).map((r) => ROLE_LABELS[r as UserRole]) }
        : { possible: false, by: [] as string[] },
  family: "console" as const,
  screens: MANUAL.filter((m) => m.workspace === w.key),
}));

const WORKBENCH_OVERVIEWS: readonly WorkspaceOverview[] = WORKBENCH_WORKSPACES.map((w) => ({
  key: w.key,
  label: w.label,
  purpose: w.purpose,
  openTo: w.openTo,
  accessBasis: w.accessBasis,
  /*
   * Presales is the only one of the three with an action matrix, so it is the
   * only one that can answer "by whom" with a shorter list than "everyone".
   * `create_bundle` is the representative action: it is the one that starts a
   * bundle's life, and the roles that hold it are the roles that can change
   * anything of consequence here.
   *
   * Affirm and Discovery have no such predicate. Saying `possible: true, by:
   * <every role>` is not a shrug — it is the honest reading of a workspace whose
   * only gate is a session, and it is exactly the sentence someone reviewing the
   * access model should trip over.
   */
  mutations:
    w.key === "presales"
      ? {
          possible: true,
          by: ALL_USER_ROLES.filter((r) => canPerformPresalesAction(r, "create_bundle")).map(
            (r) => ROLE_LABELS[r as UserRole],
          ),
        }
      : { possible: true, by: w.openTo },
  family: "workbench" as const,
  screens: MANUAL.filter((m) => m.workspace === w.key),
}));

export const WORKSPACE_OVERVIEWS: readonly WorkspaceOverview[] = [
  ...CONSOLE_OVERVIEWS,
  ...WORKBENCH_OVERVIEWS,
];

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
