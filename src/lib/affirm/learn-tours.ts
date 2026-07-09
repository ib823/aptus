/**
 * Affirm coach-mark tour definitions.
 *
 * Deliberately separate from the portal tours in src/lib/tour/tours.ts:
 * those key off `path.includes(pathMatch)`, which collides with affirm's
 * /scope and /review sub-routes. These affirm tours are matched by a
 * dedicated resolver (tourForPath) and driven by the affirm-scoped
 * <AffirmLearnProvider> using driver.js directly.
 *
 * Each step targets a `[data-tour="..."]` anchor added to the affirm
 * screens. Steps whose anchor isn't in the DOM are skipped at run time,
 * so a tour degrades gracefully if a screen omits an anchor.
 */

export interface AffirmTourStep {
  /** CSS selector for the target element (a data-tour anchor). */
  element: string;
  title: string;
  description: string;
  side?: "top" | "bottom" | "left" | "right";
}

export interface AffirmTour {
  /** Stable id — used as the localStorage completion key. */
  id: string;
  title: string;
  steps: AffirmTourStep[];
}

export const AFFIRM_TOURS: Record<string, AffirmTour> = {
  "affirm-index": {
    id: "affirm-index",
    title: "Affirm bundles",
    steps: [
      {
        element: '[data-tour="affirm-guide"]',
        title: "Start here",
        description:
          "This panel explains what each screen is for in plain language. You can hide it once you're comfortable — it stays one tap away.",
        side: "bottom",
      },
      {
        element: '[data-tour="affirm-new"]',
        title: "Create a bundle",
        description:
          "A bundle is one client's set of processes plus the questions they'll confirm. Start one here.",
        side: "bottom",
      },
      {
        element: '[data-tour="affirm-list"]',
        title: "Your bundles",
        description:
          "Each row is a client engagement. The state pill tells you where it is: Draft, Issued, Awaiting review, or Released.",
        side: "top",
      },
      {
        element: '[data-tour="learn-glossary"]',
        title: "Decode any term",
        description:
          "Hit a word you don't know? Open this to search a plain-language glossary of every SAP term in the tool.",
        side: "left",
      },
    ],
  },
  "affirm-assemble": {
    id: "affirm-assemble",
    title: "Assemble scope",
    steps: [
      {
        element: '[data-tour="affirm-tree"]',
        title: "The process tree",
        description:
          "Drill from broad 'value streams' down to individual 'scope items' — the switch-on-able SAP processes. Tick the ones this client uses.",
        side: "right",
      },
      {
        element: '[data-tour="affirm-selection"]',
        title: "What you've picked",
        description:
          "Your running selection. This defines what the SAP system will cover and which questions the client is asked.",
        side: "left",
      },
    ],
  },
  "affirm-questions": {
    id: "affirm-questions",
    title: "Question editor",
    steps: [
      {
        element: '[data-tour="affirm-question-editor"]',
        title: "Shape each question",
        description:
          "Rewrite SAP's wording into plain client language, set its format, reorder, or disable it. The original SAP text stays locked underneath.",
        side: "top",
      },
      {
        element: '[data-tour="affirm-issue"]',
        title: "Issue to the client",
        description:
          "When the questions are ready, issue the bundle. That freezes the scope and opens the client's view.",
        side: "bottom",
      },
    ],
  },
  "affirm-client": {
    id: "affirm-client",
    title: "Answering the questions",
    steps: [
      {
        element: '[data-tour="affirm-howto"]',
        title: "How to answer",
        description:
          "You're confirming how your business runs. Each card is one question about a way of working.",
        side: "bottom",
      },
      {
        element: '[data-tour="affirm-choices"]',
        title: "The three choices",
        description:
          "Adopt SAP standard (it fits) · Discuss in workshop (unsure) · We do this differently (you have a specific need — you'll add a short reason).",
        side: "top",
      },
      {
        element: '[data-tour="affirm-verbatim"]',
        title: "See the exact SAP wording",
        description:
          "Every plain-language question keeps SAP's original text underneath, so nothing is lost in translation.",
        side: "top",
      },
      {
        element: '[data-tour="affirm-submit"]',
        title: "Submit when done",
        description:
          "Answer every card, then submit. Nothing is final until your consultant reviews and releases it back.",
        side: "top",
      },
    ],
  },
  "affirm-review": {
    id: "affirm-review",
    title: "Review & release",
    steps: [
      {
        element: '[data-tour="affirm-review-summary"]',
        title: "What the client chose",
        description:
          "Their sealed answers, grouped: adopt-standard, discuss, and deviations. Deviations become workshop design topics.",
        side: "bottom",
      },
      {
        element: '[data-tour="affirm-release"]',
        title: "Release",
        description:
          "Releasing generates the deliverables and hands off to workshop preparation. You can also send back for clarification.",
        side: "top",
      },
    ],
  },
  "affirm-output": {
    id: "affirm-output",
    title: "Output",
    steps: [
      {
        element: '[data-tour="affirm-artefacts"]',
        title: "The deliverables",
        description:
          "A signed record of every decision, plus a workshop agenda pre-sorted into design topics, discussion items, and fast-confirms.",
        side: "top",
      },
    ],
  },
};

/** Resolve the tour that matches a pathname (mirrors screenGuideForPath). */
export function tourForPath(pathname: string): AffirmTour | null {
  if (pathname === "/affirm" || pathname.endsWith("/affirm")) {
    return AFFIRM_TOURS["affirm-index"] ?? null;
  }
  if (pathname.endsWith("/new") || pathname.endsWith("/scope")) {
    return AFFIRM_TOURS["affirm-assemble"] ?? null;
  }
  if (pathname.endsWith("/questions")) return AFFIRM_TOURS["affirm-questions"] ?? null;
  if (pathname.endsWith("/review")) return AFFIRM_TOURS["affirm-review"] ?? null;
  if (pathname.endsWith("/output")) return AFFIRM_TOURS["affirm-output"] ?? null;
  if (/^\/affirm\/[^/]+$/.test(pathname)) return AFFIRM_TOURS["affirm-client"] ?? null;
  return null;
}
