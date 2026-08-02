/**
 * The Workbench half of the manual — Affirm, Presales, Process Discovery.
 *
 * The Console manual (`manual.ts`) documents three workspaces that a governance
 * audience reads. These three are where consultants spend the day, and they had
 * no pages at all: "Help & docs" pointed at a manual about a different part of
 * the product, so a consultant in Affirm read twenty pages about Control Tower
 * and concluded the help was broken.
 *
 * SAME RULE AS THE CONSOLE. Structure is derived — the screen inventory comes
 * from `@/lib/workbench/sections`, which Discovery's rail also renders from, and
 * which a test checks against the real route tree in both directions. What is
 * hand-written here is the part nothing can compute: what a screen is FOR, and
 * what it deliberately refuses to establish.
 *
 * ALL THREE NOW COMPUTE `openTo` FROM A REAL PREDICATE. That was not true when
 * these pages were written: Affirm and Discovery had no role gate at all, so
 * this file carried `accessBasis: "session"` and the pages said "any signed-in
 * user — no role gate", because printing a plausible role list beside a
 * workspace that had none would have invented a control.
 *
 * Documenting the gap is what got it closed. `canAccessAffirm` and
 * `canAccessDiscovery` now exist and the layouts enforce them, so the honest
 * answer changed and this file changed with it — which is the whole reason the
 * basis is carried explicitly rather than assumed.
 */

import {
  AFFIRM_SECTIONS,
  DISCOVERY_SECTIONS,
  PRESALES_SECTIONS,
  type WorkbenchSection,
} from "@/lib/workbench/sections";
import { canAccessPresales } from "@/lib/presales/rbac";
import { canAccessAffirm, canAccessDiscovery } from "@/lib/workbench/rbac";
import { ALL_USER_ROLES, ROLE_LABELS, type UserRole } from "@/types/assessment";

export type WorkbenchWorkspace = "affirm" | "presales" | "discovery";

/** The prose a screen needs and nothing can compute for it. */
export interface WorkbenchProse {
  answers: string;
  cannotTell: readonly string[];
  misreadings?: readonly { seeing: string; means: string }[];
}

/* ───────────────────────────────── Affirm ──────────────────────────────── */

const AFFIRM_PROSE: Record<string, WorkbenchProse> = {
  "affirm/list": {
    answers:
      "Every affirm-bundle for this organization, newest first, with the state each one is sitting in.",
    cannotTell: [
      "Whether a client has started answering. A bundle reads ISSUED from the moment it is sent until the moment it is submitted, however much of it has been filled in.",
    ],
    misreadings: [
      {
        seeing: "A bundle that has been ISSUED for weeks",
        means:
          "Not necessarily ignored. The state changes only on submission, so a client three questions from the end looks identical to one who never opened the link. The bundle's own page shows what has actually been answered.",
      },
    ],
  },
  "affirm/new": {
    answers: "Create a bundle by choosing the value streams and scope items it should cover.",
    cannotTell: [
      "Which questions the client will actually see. Scope items carry affirm-sets, and the country facet filters them further, so the question count is not known until the scope is saved.",
    ],
    misreadings: [
      {
        seeing: "A scope item that adds no questions",
        means:
          "Legitimate. Not every scope item carries an affirm-set yet. The question editor says so rather than the bundle silently being shorter than expected.",
      },
    ],
  },
  "affirm/scope": {
    answers: "Change what a draft bundle covers, before it goes anywhere near the client.",
    cannotTell: [
      "Anything about a bundle that has been issued. Scope is frozen at issue and this screen redirects to Review, because a client cannot be asked to affirm a scope that moved under them.",
    ],
  },
  "affirm/questions": {
    answers:
      "Review every question the client will be asked, edit the wording, set each one's format, reorder them, and add questions of your own.",
    cannotTell: [
      "Whether a question is answerable by this client. It shows what the SAP standard is and what the question means; whether the client's finance team can decide it is what the workshop is for.",
    ],
    misreadings: [
      {
        seeing: "The editor is read-only on an issued bundle",
        means:
          "Deliberate, and recent. Editing used to flow straight through to a client mid-answer — wording, order and enable/disable — with no version and no record of what a question said when it was answered. The Review screen promises the opposite in as many words: client answers are sealed.",
      },
      {
        seeing: "Editing wording here does not change the same question in another bundle",
        means:
          "Correct, and it did not always work this way. Wording lives on a shared question bank; a bundle keeps its own copy from the moment it is issued, so one client's rewording cannot rewrite another client's signed record.",
      },
      {
        seeing: "Issue refused because questions are unconfirmed",
        means:
          "Every suggested question has to be accepted or excluded first. A suggestion is a draft nobody has agreed to, and sending one to a client asks them to affirm something no consultant has stood behind.",
      },
    ],
  },
  "affirm/client": {
    answers:
      "The screen the client is answering, exactly as they see it — plain language above, SAP verbatim beneath.",
    cannotTell: [
      "What the client will decide. Every question defaults to Adopt SAP standard and a deviation requires a written reason, so a blank is an unanswered question rather than an implied agreement.",
    ],
    misreadings: [
      {
        seeing: "A question naming a country the client is not in",
        means:
          "A defect being actively fenced. Questions carry a country facet, and a bundle with a country set filters them out; anything still showing is a question whose own text names a country its facet does not. That combination fails a build check.",
      },
    ],
  },
  "affirm/review": {
    answers:
      "What the client actually affirmed, where they deviated and why, and the gate that releases it.",
    cannotTell: [
      "Whether a deviation is acceptable. The screen surfaces every one with the client's stated reason; judging them is the consultant's job and is the reason this gate is not automatic.",
    ],
    misreadings: [
      {
        seeing: "An answered count lower than the number of questions you remember",
        means:
          "Excluded questions are not counted on either side of the fraction. This once read '9 of 8' because the numerator counted every question and the denominator counted only the client-facing ones.",
      },
    ],
  },
  "affirm/output": {
    answers: "The artefacts a released bundle produced, and what still has to be done by hand.",
    cannotTell: [
      "Whether the client received anything. Delivery is manual — the screen renders the record and the agenda so they can be checked before sending, and it does not send them.",
    ],
  },
};

/* ──────────────────────────────── Presales ─────────────────────────────── */

const PRESALES_PROSE: Record<string, WorkbenchProse> = {
  "presales/list": {
    answers: "Every presales bundle, filtered by the state it is in and searchable by client or scope code.",
    cannotTell: [
      "Whether a client has opened their link. The state covers draft, sent, awaiting signoff, signed and expired; engagement inside a sent bundle is on the bundle's own page.",
    ],
    misreadings: [
      {
        seeing: "New bundle disabled with a view-only note",
        means:
          "A role, not a fault. Executive sponsors and project managers may view a bundle and preview it as the client would see it; creating and sending belong to consultants, partner leads and platform admins.",
      },
    ],
  },
  "presales/new": {
    answers:
      "Build a bundle: the engagement it belongs to, how it is presented to the client, the scope it covers, who receives it, how long their access lasts, and which legal notices apply.",
    cannotTell: [
      "Whether the recipients are the right people. The signatory is whoever is marked as one here, and that choice is what the signed record will rest on.",
    ],
    misreadings: [
      {
        seeing: "An access window is required",
        means:
          "Not a formality. The window is what ends a client's access without anyone remembering to end it, and it has been mandatory here since the beginning — which is why this flow never had the unbounded-grant problem the executive invite did.",
      },
    ],
  },
  "presales/bundle": {
    answers:
      "One bundle's state, its recipients, what has been decided so far, and the actions still open to you.",
    cannotTell: [
      "What the client sees. This is the consultant view and it deliberately shows effort estimates unredacted; Preview as client is the only honest answer to that question.",
    ],
    misreadings: [
      {
        seeing: "Extend and Revoke disabled on a signed bundle",
        means:
          "A signed bundle is a record, not a live document. Changing it after signature would alter what somebody agreed to; a change request is the route, and it is offered on the same screen.",
      },
    ],
  },
  "presales/preview": {
    answers: "Exactly what the client sees for one scope item, through the same redaction the client gets.",
    cannotTell: [
      "Anything about your own permissions. The preview ignores the consultant's grant and OTP state on purpose, because the question it answers is what a fresh client would see.",
    ],
    misreadings: [
      {
        seeing: "Export and sign controls disabled",
        means:
          "The preview is a view, not a session. If those worked, a consultant could sign on the client's behalf from a screen labelled preview.",
      },
    ],
  },
  "presales/audit": {
    answers: "Every recorded event for this bundle, filterable by type and searchable, exportable as CSV.",
    cannotTell: [
      "What a client read. It records events the platform performed — issued, viewed, decided, signed — not time spent or attention paid.",
    ],
  },
  "presales/change-request": {
    answers: "Capture a change a client wants after they have already signed.",
    cannotTell: [
      "Whether anyone will act on it. This release captures and audits the request; routing it into a consultant's review queue is not built, and the screen should not imply a workflow that does not exist.",
    ],
    misreadings: [
      {
        seeing: "The screen redirects away",
        means:
          "The bundle is not signed. Before signature there is nothing to change against — edit the bundle itself.",
      },
    ],
  },
  "presales/settings": {
    answers:
      "Your own defaults: the title on generated PDFs, notification preferences, the default access window and accent colour.",
    cannotTell: [
      "Anything about other consultants' defaults. These are stored against your user record and apply only to bundles you create.",
    ],
    misreadings: [
      {
        seeing: "A saved value that survives a reload",
        means:
          "Worth stating because it did not always. Save spent months as a no-op that redirected back looking successful, and the file claimed a persistence mechanism that never existed.",
      },
    ],
  },
};

/* ──────────────────────────── Process Discovery ────────────────────────── */

const DISCOVERY_PROSE: Record<string, WorkbenchProse> = {
  "discovery/home": {
    answers: "Where a facilitator starts: the health of the library, and the engagements in flight.",
    cannotTell: [
      "Anything about an engagement with no reviewers. It shows an honest zero rather than a placeholder, because there are no fixture rows anywhere in this workspace.",
    ],
    misreadings: [
      {
        seeing: "No first-run or empty-library state",
        means:
          "There cannot be one. The library is a committed file, so it is never absent — an Import the base library button would be a control that cannot do anything.",
      },
    ],
  },
  "discovery/library": {
    answers: "The process library itself: what each process is, where it came from, and how complete it is.",
    cannotTell: [
      "Whether a process is right for a particular client. Provenance says where a process came from, not whether it fits the engagement in front of you.",
    ],
    misreadings: [
      {
        seeing: "Two different process totals depending on the screen",
        means:
          "Both are correct and they count different sets. The library holds a shared SAP core plus an ABeam-authored overlay; Affirm's scope list holds the same core plus items Discovery parks. The origin field is what tells them apart.",
      },
    ],
  },
  "discovery/coverage": {
    answers: "Which categories the library actually covers, measured as flow share rather than process count.",
    cannotTell: [
      "That a well-populated category is well covered. A category with 253 processes and no flows is a list, not coverage, and the caption says which of the two is being measured.",
    ],
    misreadings: [
      {
        seeing: "A category with many processes marked thin",
        means:
          "Working as intended. Coverage is the share of processes carrying flows; a large category of bare entries scores low precisely because the count would have flattered it.",
      },
    ],
  },
  "discovery/sources": {
    answers: "The capture pipeline — harvest, triage, generalize, anonymize, review, promote.",
    cannotTell: [
      "Whether anonymisation succeeded. The pipeline has a review step because that judgement is made by a person; nothing here certifies that client-identifying detail is gone.",
    ],
  },
  "discovery/sessions": {
    answers: "The engagements being run, and the reviewers attached to each.",
    cannotTell: [
      "Anything that has not been entered. The list is empty until real sessions exist — no sample clients and no invented reviewers, which the design this was built from did ship.",
    ],
  },
  "discovery/map": {
    answers:
      "The internal mapping between the process library and product terms — the consultant-only view of how the two line up.",
    cannotTell: [
      "Anything a client may see. This is fenced: it exists only inside the consultant workspace and must never be reachable from a client session.",
    ],
    misreadings: [
      {
        seeing: 'The context chip reads "Consultant only — not shared"',
        means:
          "The chip's whole job is telling you whether a surface is internal, and this is the screen where being wrong about that is worst. It deliberately does not show the default Editing library label here.",
      },
    ],
  },
  "discovery/outputs": {
    answers: "Pick an engagement to review what it produced and export it.",
    cannotTell: [
      "Whether an output has been sent to anyone. Export produces the artefact; delivery happens outside the platform.",
    ],
  },
  "discovery/health": {
    answers: "Where the library came from and how complete it is, computed from the committed manifest.",
    cannotTell: [
      "Whether the content is correct. It governs provenance and completeness — that a process is accounted for and traceable — not whether its steps describe SAP accurately.",
    ],
    misreadings: [
      {
        seeing: "Figures that never fall back to a round number",
        means:
          "Deliberate. Every figure is read or computed from the manifest, with no literals and no default totals, so a number here cannot survive the data behind it going missing.",
      },
    ],
  },
};

/* ──────────────────────────────── Assembly ─────────────────────────────── */

export interface WorkbenchWorkspaceDescriptor {
  key: WorkbenchWorkspace;
  label: string;
  purpose: string;
  sections: readonly WorkbenchSection[];
  prose: Record<string, WorkbenchProse>;
  /**
   * How the product decides who may open this workspace.
   *
   * "role"    — a real predicate exists and the roster below is computed from it.
   * "session" — the Workbench layout checks for a signed-in user and nothing
   *             else. The roster is every role, because that is literally true.
   */
  accessBasis: "role" | "session";
  openTo: readonly string[];
}

export const WORKBENCH_WORKSPACES: readonly WorkbenchWorkspaceDescriptor[] = [
  {
    key: "affirm",
    label: "Affirm",
    purpose:
      "Affirm is where a client confirms, in writing, which SAP standard processes they adopt and where they deviate — the record a Fit-to-Standard workshop starts from.",
    sections: AFFIRM_SECTIONS,
    prose: AFFIRM_PROSE,
    accessBasis: "role",
    openTo: ALL_USER_ROLES.filter((r) => canAccessAffirm(r)).map((r) => ROLE_LABELS[r as UserRole]),
  },
  {
    key: "presales",
    label: "Presales",
    purpose:
      "Presales is where a scoped proposal is packaged for a client, sent under a time-boxed access window, and signed.",
    sections: PRESALES_SECTIONS,
    prose: PRESALES_PROSE,
    accessBasis: "role",
    // Computed from the same predicate the pages redirect on, over the real
    // role list — never a table maintained here.
    openTo: ALL_USER_ROLES.filter((r) => canAccessPresales(r)).map((r) => ROLE_LABELS[r as UserRole]),
  },
  {
    key: "discovery",
    label: "Process Discovery",
    purpose:
      "Process Discovery is the process library and the sessions run against it — what the practice knows, how well it is covered, and what an engagement produced.",
    sections: DISCOVERY_SECTIONS,
    prose: DISCOVERY_PROSE,
    accessBasis: "role",
    openTo: ALL_USER_ROLES.filter((r) => canAccessDiscovery(r)).map((r) => ROLE_LABELS[r as UserRole]),
  },
] as const;

/** Every prose key across the three, so a stale entry is detectable. */
export const WORKBENCH_PROSE_KEYS: readonly string[] = WORKBENCH_WORKSPACES.flatMap((w) =>
  Object.keys(w.prose),
);
