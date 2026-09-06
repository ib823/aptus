/**
 * 2608 WS6 — the words that frame a To-Be Process Pack.
 *
 * The diagrams show WHAT the to-be process is. Handed to a client without
 * framing they invite two wrong readings: that this is a finished design, and
 * that a step drawn "Standard" has been agreed rather than merely not yet
 * challenged. These blocks say what the pack is, what it is not, where every
 * mark came from, what still drives the effort, and what the client is being
 * asked to do with it.
 *
 * One source of words, two renderers — the same reason `layoutL2` is shared by
 * the PDF and the PPTX. A caveat that exists in one export and not the other is
 * worse than one that exists in neither, because it looks deliberate.
 *
 * Nothing here computes effort. The pack counts what it can see and names the
 * parameters it cannot; converting those into person-days needs an estimation
 * model this pack does not carry, and inventing one would contradict the rule
 * the whole engine is built on.
 */
import { STATE_STYLE } from "./svg";
import type { TobePackDoc, TobeStepState } from "./types";

export interface NarrativeTable {
  head: string[];
  rows: string[][];
}

export interface NarrativeBlock {
  heading: string;
  sub?: string;
  lead?: string;
  bullets?: string[];
  table?: NarrativeTable;
  footnote?: string;
}

/** Countable drivers the pack can state from its own contents. */
export function effortDriversFromPack(doc: TobePackDoc): NarrativeTable {
  const s = doc.summary;
  const classified = doc.scopeItems.reduce((n, i) => n + i.gaps.filter((g) => g.gapType !== null).length, 0);
  const unclassified = s.gaps - classified;
  return {
    head: ["Driver", "Count", "What it means for effort"],
    rows: [
      ["Scope items in scope", String(s.scopeItems), "Each is a process to walk, validate and sign off."],
      ["Process steps drawn", String(s.steps), "The surface a Fit-to-Standard workshop has to cover."],
      [
        "Steps left standard",
        String(s.byState.STANDARD),
        "No configuration implied. Still needs confirming, not building.",
      ],
      [
        "Configuration activities (SSCUI)",
        String(s.configuredSscuis),
        "Each is a named self-service activity someone must perform and test.",
      ],
      ["Gaps — classified", String(classified), "Extension, workaround or integration; each needs a design decision."],
      ["Gaps — not yet classified", String(unclassified), "A deviation with no rule to interpret it. Workshop input."],
      [
        "Scope items to confirm in workshop",
        String(s.confirmInWorkshop),
        "Carries an optional step, a 'discuss', or an unanswered question.",
      ],
      ["Questions not yet answered", String(s.unansweredQuestions), "Unknowns that can still move the design."],
      [
        "Answers outside this scope",
        String(s.answersOutsideScope),
        "Answered, but naming no scope item here — check the scope set.",
      ],
    ],
  };
}

/**
 * Effort parameters this pack cannot know. Standard SAP sizing drivers; the
 * pack asks for them rather than assuming them, because every one of these
 * multiplies the work behind the same picture.
 */
export const EFFORT_PARAMETERS_TO_COLLECT: string[] = [
  "Organisational: legal entities, company codes, plants, storage locations, sales organisations, distribution channels, divisions, purchasing organisations",
  "Financial: charts of accounts, controlling areas, currencies, fiscal year variants, consolidation requirements",
  "Geographic: countries and localisations in scope, languages, rollout waves",
  "People: users by business role, concurrent users, training populations, locations",
  "Integration: inbound and outbound interfaces, middleware, third-party systems, EDI partners",
  "Data: migration objects, source systems, record volumes, cleansing effort, historical data retention",
  "Extensions: reports, interfaces, conversions, enhancements, forms and workflows (RICEFW) arising from the gaps above",
  "Compliance: statutory reporting, e-invoicing, tax determination, audit and archiving requirements",
];

export function packNarrative(doc: TobePackDoc, opts: { clientName: string }): NarrativeBlock[] {
  const s = doc.summary;
  const rel = doc.release;
  const chainNames = doc.chains.map((c) => c.name).join("; ");

  return [
    {
      heading: "How to read this pack",
      sub: "Three layers, one process",
      lead: `This pack shows how ${opts.clientName} will run on SAP Cloud ERP, drawn from the scope items in the engagement and the answers already given to the Fit-to-Standard questions. It is generated, not written: every mark traces to a source, and where there is no source there is no mark.`,
      table: {
        head: ["Layer", "What it shows", "What to do with it"],
        rows: [
          [
            "L1 — end-to-end",
            `The chain of scope items that make up the process end to end${chainNames ? ` (${chainNames})` : ""}, with a bar under each showing how its steps split across the states below.`,
            "Check the chain is the business you actually run, and that nothing is missing from it.",
          ],
          [
            "L2 — swimlane",
            "Each scope item as its process steps in sequence, laid out in lanes by the business role that performs them.",
            "Check the sequence and the roles. Flag steps you do not do, and steps you do that are not here.",
          ],
          [
            "L3 — step detail",
            "Every step as a row: role, app, state, configuration activity, expected result, and the evidence behind it.",
            "The working list for the workshop. Each row names the BPD and the question it came from.",
          ],
        ],
      },
      footnote:
        "There is no L4 in this pack. Below a process step sits the transaction or app itself, which is demonstrated in the system rather than drawn here.",
    },
    {
      heading: "What the colours mean",
      sub: "A state is a claim about evidence, not an opinion",
      table: {
        head: ["State", "Meaning", "How a step gets it"],
        rows: [
          [
            STATE_STYLE.STANDARD.label,
            "The SAP standard step, unchanged.",
            "The default. No answer has yet said otherwise — this is not the same as agreed.",
          ],
          [
            STATE_STYLE.CONFIGURED.label,
            "Standard, adjusted through a named self-service configuration activity.",
            "An answer of 'we differ' on a question that maps to a real SSCUI id in the SAP 2608 list.",
          ],
          [
            STATE_STYLE.VARIANT.label,
            "An alternative path through the standard process.",
            "An answer that selects a documented variant rather than a change.",
          ],
          [
            STATE_STYLE.GAP.label,
            "A stated difference that standard does not cover.",
            "An answer of 'we differ' with no configuration activity behind it. Needs a design decision.",
          ],
          [
            STATE_STYLE.NOT_IN_SCOPE.label,
            "Drawn for context; not part of this engagement's scope.",
            "The step's scope item sits on the chain but is not in the agreed scope set.",
          ],
        ],
      },
    },
    {
      heading: "What this pack is not",
      sub: "Read this before treating anything here as agreed",
      bullets: [
        `This is SAP standard best practice at content release ${rel}, shaped by the answers received so far. It is not a signed-off design and not a build specification.`,
        `A step shown as ${STATE_STYLE.STANDARD.label} means nothing has yet been said against it. It does not mean it has been reviewed, agreed, or tested.`,
        s.unansweredQuestions > 0
          ? `${s.unansweredQuestions} relevant question(s) are still unanswered. Answers to those can change the states on this pack.`
          : "Every relevant question carries an answer, so no step here is waiting on a missing response.",
        s.confirmInWorkshop > 0
          ? `${s.confirmInWorkshop} scope item(s) are flagged to confirm in the workshop, because they carry an optional step, a 'to discuss' answer, or an unclassified gap.`
          : "No scope item is currently flagged for workshop confirmation.",
        "Steps the SAP document marks optional are drawn with a dashed border. Whether you use them is a decision, not a default.",
        "Nothing on these pages is inferred. Where a scope item has no SAP process document loaded, the pack says so rather than drawing a plausible flow.",
        "Effort and duration are not stated here. The counts on the next page are the drivers; converting them into a plan needs the sizing parameters listed beside them.",
      ],
    },
    {
      heading: "Where every mark comes from",
      sub: "Provenance and reproducibility",
      table: {
        head: ["Element", "Source"],
        rows: [
          ["Process steps, roles, apps, expected results", `SAP Business Process Documents, content release ${rel}`],
          ["Questions and the answers behind each state", "SAP Business Driven Configuration questionnaires, as answered in this engagement"],
          ["Configuration activity ids and names", `SAP Self-Service Configuration UI list, release ${rel}`],
          ["End-to-end chains", "Repository-defined chain for this value stream, recorded with its source"],
          ["Scope set", "The scope items agreed for this engagement"],
        ],
      },
      footnote: `Generated ${doc.generatedAt}. Fingerprints — inputs ${doc.hashes.inputs.slice(0, 16)}, scope ${doc.hashes.scope.slice(0, 12)}, answers ${doc.hashes.answers.slice(0, 12)}, rules ${doc.hashes.rules.slice(0, 12)}. The same inputs always produce the same pack, so two versions can be compared by fingerprint rather than by eye.`,
    },
    {
      heading: "What drives the effort",
      sub: "What this pack counts, and what it still needs from you",
      lead: `The left column is what the pack can already see. It is not an estimate: the same ${s.steps} steps cost very different amounts depending on the parameters underneath.`,
      table: effortDriversFromPack(doc),
      footnote:
        "Person-day effort is deliberately not calculated here. It requires an estimation model and rates that this document does not carry.",
    },
    {
      heading: "Parameters still to be collected",
      sub: "Each of these multiplies the work behind the same picture",
      lead: "Two clients with an identical process map can differ by an order of magnitude in effort. These are the parameters that decide which one you are. Please complete them, or confirm the assumption if one has already been made.",
      bullets: EFFORT_PARAMETERS_TO_COLLECT,
    },
    {
      heading: "What happens next",
      sub: "This document is an input, not an output",
      lead: "Mark this pack up and send it back. Every correction feeds a named place in the workbench, and the pack is regenerated from those corrections rather than edited by hand.",
      table: {
        head: ["If you find", "It goes back into", "And then"],
        rows: [
          [
            "A step you do not perform, or one that is missing",
            "The scope set for this engagement",
            "The scope item list is corrected and the pack redrawn.",
          ],
          [
            "A step where you work differently from the standard",
            "The Fit-to-Standard affirm-set — the question behind that step",
            "The answer changes from standard to differ, and the step becomes a configuration or a gap.",
          ],
          [
            "A question you could not answer here",
            "The affirm-set, as the outstanding answer",
            "The unanswered count falls and the state on those steps settles.",
          ],
          [
            "A process you run that SAP scope does not cover at all",
            "Process discovery, against the neutral process library",
            "Coverage gaps are recorded before the SAP scope is fixed.",
          ],
          [
            "Agreement with the whole picture",
            "Sign-off on the scope-item bundle",
            "The agreed scope is recorded with a full decision trail.",
          ],
        ],
      },
      footnote:
        "Regeneration is cheap and repeatable. Expect several versions of this pack before one is signed; the fingerprints above make the differences between them explicit.",
    },
  ];
}

/** The state order the legend and the tables use. */
export const NARRATIVE_STATE_ORDER: TobeStepState[] = ["STANDARD", "CONFIGURED", "VARIANT", "GAP", "NOT_IN_SCOPE"];
