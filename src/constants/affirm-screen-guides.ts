/**
 * Per-screen "What is this?" explainers for the affirm flow.
 *
 * Each affirm screen gets one entry. The <ScreenGuide> component renders
 * it as a dismissible plain-language card at the top of the screen:
 * what the screen is, what to do, why it matters, and what's next. Terms
 * in the copy can be wrapped in <Term> chips by the screen itself; the
 * strings here stay plain so they're readable even without the glossary.
 *
 * `id` is a stable key used for localStorage dismissal and to pick the
 * matching guide from a pathname (see screenGuideForPath).
 */

import type { GlossaryKey } from "@/constants/affirm-glossary";

export type ScreenGuideId =
  | "affirm-index"
  | "affirm-assemble"
  | "affirm-questions"
  | "affirm-client"
  | "affirm-review"
  | "affirm-output";

export interface ScreenGuide {
  id: ScreenGuideId;
  /** Small uppercase eyebrow. */
  eyebrow: string;
  /** Plain-language screen title. */
  title: string;
  /** One-line "what this screen is". */
  what: string;
  /** What the user should do here. */
  todo: string;
  /** Why it matters. */
  why: string;
  /** What happens next. */
  next: string;
  /** Glossary terms worth surfacing as quick chips under the guide. */
  keyTerms?: GlossaryKey[];
  /** Audience hint, used only to tune copy tone. */
  audience: "consultant" | "client";
}

export const AFFIRM_SCREEN_GUIDES: Record<ScreenGuideId, ScreenGuide> = {
  "affirm-index": {
    id: "affirm-index",
    eyebrow: "Pre-onboarding · Fit-to-Standard",
    title: "Your affirmation bundles",
    what: "This is the list of affirmation bundles — one per client. Each bundle packages the SAP processes in scope plus the questions that client will confirm.",
    todo: "Open an existing bundle to pick up where it left off, or start a new one with “New bundle”.",
    why: "It's your home base for every client's Fit-to-Standard preparation, before the project formally begins.",
    next: "Open a bundle, or create one to begin assembling scope.",
    keyTerms: ["affirm-bundle", "fit-to-standard", "scope-item", "bundle-lifecycle"],
    audience: "consultant",
  },
  "affirm-assemble": {
    id: "affirm-assemble",
    eyebrow: "Step 1 · Scope",
    title: "Assemble the bundle",
    what: "You're choosing which SAP processes (“scope items”) apply to this client by drilling through the process tree, from broad value streams down to individual items.",
    todo: "Name the client, expand the value streams, and tick the scope items they use. A badge shows which items already carry ready-made questions.",
    why: "Your selection defines what the SAP system will cover for this client — and which questions they'll be asked to confirm.",
    next: "Create the bundle to move on to shaping its questions.",
    keyTerms: ["scope-item", "value-stream", "sub-process", "affirm-set", "foundation"],
    audience: "consultant",
  },
  "affirm-questions": {
    id: "affirm-questions",
    eyebrow: "Step 2 · Question editor",
    title: "Shape the questions",
    what: "Every in-scope question, ready for you to turn into plain language before the client sees it.",
    todo: "Rewrite wording, set each question's format (Decision or Information), reorder, disable what doesn't apply, or add your own. The original SAP wording stays locked as the source of truth.",
    why: "Clear, jargon-free questions get better answers. This is where SAP-speak becomes client-speak.",
    next: "Issue the bundle to freeze the scope and send it to the client.",
    keyTerms: ["l2-question", "decision-question", "information-question", "sap-verbatim", "issued"],
    audience: "consultant",
  },
  "affirm-client": {
    id: "affirm-client",
    eyebrow: "Fit-to-Standard · Your input",
    title: "Confirm how your business runs",
    what: "Your consultant has prepared questions about how your business works. For most, SAP already has a standard, ready-made way of doing things — you're saying whether that fits you.",
    todo: "For each card, pick one: “Adopt SAP standard” (it fits), “Discuss in workshop” (unsure), or “We do this differently” (you have a specific need). Some cards ask for a short written answer instead.",
    why: "Your answers become the workshop agenda. Adopting the standard where you can keeps the project faster and cheaper; flagging real differences early means no surprises later.",
    next: "Answer every card, then submit. Nothing is final until your consultant reviews and releases it back to you.",
    keyTerms: ["adopt-standard", "discuss-in-workshop", "deviation", "sap-verbatim", "workshop"],
    audience: "client",
  },
  "affirm-review": {
    id: "affirm-review",
    eyebrow: "Step 4 · Review & release",
    title: "Review the client's answers",
    what: "The client's answers, sealed and grouped for you: what they'll adopt as standard, what they want to discuss, and where they differ.",
    todo: "Read the deviations and discussion items, sanity-check the flagged and excluded rows, then release.",
    why: "Releasing turns the client's answers into the workshop deliverables — deviations become design topics, standards become fast-confirms.",
    next: "Release to generate the output documents, or send back for clarification.",
    keyTerms: ["sealed", "deviation", "flagged", "excluded", "fast-confirm", "released"],
    audience: "consultant",
  },
  "affirm-output": {
    id: "affirm-output",
    eyebrow: "Step 5 · Output",
    title: "The deliverables",
    what: "The two documents generated at release: a signed record of every decision, and a pre-sorted workshop agenda.",
    todo: "Review and download the artefacts. Delivery to the client is manual.",
    why: "These close out the pre-onboarding affirmation and set up the workshop.",
    next: "Move to workshop preparation — this affirmation is complete.",
    keyTerms: ["signed-record", "workshop-agenda", "released", "workshop"],
    audience: "consultant",
  },
};

/**
 * Pick the screen guide for a pathname. Order matters: the more specific
 * sub-routes (scope/questions/review/output) are checked before the
 * bare /affirm/[id] client view.
 */
export function screenGuideForPath(pathname: string): ScreenGuide | null {
  if (pathname === "/affirm" || pathname.endsWith("/affirm")) {
    return AFFIRM_SCREEN_GUIDES["affirm-index"];
  }
  if (pathname.endsWith("/new") || pathname.endsWith("/scope")) {
    return AFFIRM_SCREEN_GUIDES["affirm-assemble"];
  }
  if (pathname.endsWith("/questions")) {
    return AFFIRM_SCREEN_GUIDES["affirm-questions"];
  }
  if (pathname.endsWith("/review")) {
    return AFFIRM_SCREEN_GUIDES["affirm-review"];
  }
  if (pathname.endsWith("/output")) {
    return AFFIRM_SCREEN_GUIDES["affirm-output"];
  }
  // Bare /affirm/<id> — the client affirm cards.
  if (/^\/affirm\/[^/]+$/.test(pathname)) {
    return AFFIRM_SCREEN_GUIDES["affirm-client"];
  }
  return null;
}
