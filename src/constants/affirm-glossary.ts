/**
 * Affirm jargon glossary — the single source of truth for every SAP /
 * domain term a newcomer meets in the affirm flow.
 *
 * One entry per term. `short` is a plain-language definition (no SAP
 * jargon inside the jargon), `why` says why it matters to the person
 * using the tool, and `related` links to other terms by key. The same
 * dataset powers:
 *   - inline <Term> chips (hover/tap → popover),
 *   - the "Decode the jargon" glossary drawer,
 *   - and any per-screen explainer that wants to reference a term.
 *
 * Keep definitions jargon-free and short (2–3 sentences). Write for an
 * auditor who has never seen SAP.
 */

export type GlossaryKey =
  | "fit-to-standard"
  | "pre-onboarding"
  | "affirm-bundle"
  | "affirm-set"
  | "value-stream"
  | "sub-process"
  | "scope-item"
  | "foundation"
  | "l2-question"
  | "l3-configuration"
  | "bdc"
  | "sap-verbatim"
  | "sscui"
  | "s4hana-cloud-public"
  | "decision-question"
  | "information-question"
  | "adopt-standard"
  | "discuss-in-workshop"
  | "deviation"
  | "fast-confirm"
  | "workshop"
  | "bundle-lifecycle"
  | "draft"
  | "issued"
  | "sealed"
  | "released"
  | "signed-record"
  | "workshop-agenda"
  | "excluded"
  | "flagged"
  | "mandatory-my"
  | "fiori-app"
  | "consultant-added"
  | "pending-curation";

export interface GlossaryEntry {
  /** Human-readable term as it appears on screen. */
  term: string;
  /** Plain-language definition — no SAP jargon inside. */
  short: string;
  /** Why it matters to the person using the tool. */
  why: string;
  /** Related terms, by key. */
  related?: GlossaryKey[];
}

export const AFFIRM_GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  "fit-to-standard": {
    term: "Fit-to-Standard",
    short:
      "Adopting SAP's ready-made, best-practice way of working instead of customising the system to match exactly how you work today.",
    why: "Standard setup is cheaper, faster to roll out, and easier to keep up to date. The whole affirm process exists to find where you can adopt the standard and where you genuinely can't.",
    related: ["scope-item", "deviation", "workshop", "s4hana-cloud-public"],
  },
  "pre-onboarding": {
    term: "Pre-onboarding",
    short:
      "The preparation phase that happens before the formal SAP project kicks off.",
    why: "Making these decisions early means the first project workshops start with answers instead of blank pages.",
    related: ["workshop", "affirm-bundle"],
  },
  "affirm-bundle": {
    term: "Affirm bundle",
    short:
      "A package of scope plus questions that a consultant assembles and sends to one client to review and confirm ('affirm').",
    why: "It's the unit of work here — one bundle per client engagement, moving through a clear set of states.",
    related: ["scope-item", "l2-question", "bundle-lifecycle"],
  },
  "affirm-set": {
    term: "Affirm-set",
    short: "The set of ready-made questions attached to a scope item.",
    why: "Not every scope item has one. Items with an affirm-set can be turned into client questions automatically; items without need manual work.",
    related: ["l2-question", "scope-item", "bdc"],
  },
  "value-stream": {
    term: "Value stream",
    short:
      "A top-level grouping of related business processes — e.g. 'Lead to Cash' (selling) or 'Source to Pay' (buying).",
    why: "It's the map's continents. You don't pick a value stream directly; you drill into it to find the scope items you actually use.",
    related: ["scope-item", "sub-process", "foundation"],
  },
  "sub-process": {
    term: "Sub-process",
    short:
      "A mid-level grouping inside a value stream — one step more specific than the stream.",
    why: "It helps you navigate from a broad business area down to the exact scope items.",
    related: ["value-stream", "scope-item"],
  },
  "scope-item": {
    term: "Scope item",
    short:
      "SAP's name for a single, self-contained business process you can switch on — e.g. 'Sell from Stock' or 'Accounts Payable'. The building blocks of an SAP system.",
    why: "Choosing your scope items defines what the SAP system will do for this client. Everything else follows from this list.",
    related: ["value-stream", "affirm-set", "fit-to-standard"],
  },
  foundation: {
    term: "Foundation",
    short:
      "A ninth grouping (alongside the 8 value streams) for cross-cutting basics every company needs, like master data and finance settings.",
    why: "These underpin everything, so they're grouped on their own rather than under a single process stream.",
    related: ["value-stream", "scope-item"],
  },
  "l2-question": {
    term: "L2 question",
    short:
      "A plain-language, business-level question the client answers. 'Level 2' means it's about a business decision, not a technical setting.",
    why: "These are the questions your client actually sees and affirms. They decide whether you adopt the SAP standard or need something different.",
    related: ["l3-configuration", "decision-question", "information-question"],
  },
  "l3-configuration": {
    term: "L3 configuration",
    short:
      "A lower-level, technical setup step ('Level 3') — how the system is configured, not a business decision.",
    why: "These aren't for the client to decide; they belong in the technical build. The tool flags questions that are really L3 so they don't confuse the client.",
    related: ["l2-question", "flagged"],
  },
  bdc: {
    term: "BDC (Business-Driven Configuration)",
    short:
      "SAP's library of guided configuration questions — the source of most affirm questions.",
    why: "When a scope item carries BDC content, the tool can auto-generate client questions from it instead of writing them from scratch.",
    related: ["affirm-set", "sscui"],
  },
  "sap-verbatim": {
    term: "SAP verbatim",
    short:
      "The exact original SAP wording of a question, shown as the locked 'source of truth'.",
    why: "Consultants rewrite questions in plain language, but the original SAP text is never changed or deleted — so there's always an auditable original to check against.",
    related: ["l2-question", "sscui"],
  },
  sscui: {
    term: "SSCUI",
    short:
      "SAP Self-Service Configuration UI — the reference ID of the specific SAP setting a question maps to.",
    why: "It's a precise pointer back to exactly where in SAP this decision gets configured.",
    related: ["bdc", "sap-verbatim"],
  },
  "s4hana-cloud-public": {
    term: "S/4HANA Cloud Public Edition",
    short:
      "SAP's cloud ERP product, 'Public Edition' — a standardised, shared version updated on a regular release cycle ('2602' is the release).",
    why: "Because it's standardised, 'adopt standard' is usually the smart default — heavy customisation fights the way the product is built.",
    related: ["fit-to-standard"],
  },
  "decision-question": {
    term: "Decision question",
    short:
      "A question that has a clear SAP standard answer, offering three choices: adopt standard, discuss, or 'we do this differently'.",
    why: "Most questions are decisions. The three choices sort each one into confirmed, needs-discussion, or needs-design.",
    related: ["information-question", "adopt-standard", "deviation"],
  },
  "information-question": {
    term: "Information question",
    short:
      "An open question with no single standard answer — the client types a short free-text response.",
    why: "Used when SAP needs a piece of information from you rather than offering a standard to accept or reject.",
    related: ["decision-question"],
  },
  "adopt-standard": {
    term: "Adopt SAP standard",
    short: "The choice meaning 'keep SAP's pre-delivered way of doing this'.",
    why: "The recommended default. The more you adopt, the cheaper, faster and more upgrade-safe the project stays.",
    related: ["fit-to-standard", "fast-confirm"],
  },
  "discuss-in-workshop": {
    term: "Discuss in workshop",
    short: "The choice meaning 'I'm not sure — let's talk about it in the workshop'.",
    why: "A safe middle option that parks a question for expert discussion instead of forcing a guess now.",
    related: ["workshop"],
  },
  deviation: {
    term: "We do this differently (deviation)",
    short:
      "The choice meaning the client has a specific requirement that the SAP standard doesn't cover. A short reason is required.",
    why: "Each deviation becomes a design topic for the workshop and usually means extra work — so they're tracked carefully.",
    related: ["fit-to-standard", "workshop", "adopt-standard"],
  },
  "fast-confirm": {
    term: "Fast-confirm",
    short:
      "Items where the client adopted the SAP standard, pre-sorted into a quick 'confirm' group for the workshop.",
    why: "No design is needed — just a fast group confirmation, so workshop time is spent on the hard parts.",
    related: ["adopt-standard", "workshop"],
  },
  workshop: {
    term: "Workshop",
    short:
      "The working session(s) where consultant and client walk through the results and finalise the design.",
    why: "The whole affirm process feeds the workshop agenda — deviations to design, items to discuss, and standards to fast-confirm.",
    related: ["deviation", "fast-confirm", "discuss-in-workshop", "workshop-agenda"],
  },
  "bundle-lifecycle": {
    term: "Bundle lifecycle",
    short: "The four states a bundle moves through: Draft → Issued → Submitted → Released.",
    why: "It tells you exactly where a bundle is and what can happen to it next.",
    related: ["draft", "issued", "sealed", "released"],
  },
  draft: {
    term: "Draft",
    short:
      "The starting state — the consultant is still assembling scope and editing questions. Not visible to the client yet.",
    why: "Everything is editable in draft; nothing is committed.",
    related: ["bundle-lifecycle", "issued"],
  },
  issued: {
    term: "Issued",
    short:
      "The consultant has sent the bundle to the client; scope is frozen and the questions are snapshot. The client can now answer.",
    why: "Issuing locks the scope so the client answers a stable set that won't change under them.",
    related: ["bundle-lifecycle", "sealed", "draft"],
  },
  sealed: {
    term: "Sealed",
    short: "Once the client submits, their answers are locked ('sealed') and can't be edited.",
    why: "It guarantees the consultant reviews exactly what the client submitted, unchanged.",
    related: ["issued", "released"],
  },
  released: {
    term: "Released",
    short:
      "The consultant has finished reviewing and released the results back, generating the output documents.",
    why: "The final state — the affirmation is done and hands off to workshop preparation.",
    related: ["bundle-lifecycle", "signed-record", "workshop-agenda"],
  },
  "signed-record": {
    term: "Signed affirmation record",
    short: "The output document capturing every decision in the exact wording the client saw.",
    why: "An auditable record of what was agreed, for the project file.",
    related: ["released", "workshop-agenda"],
  },
  "workshop-agenda": {
    term: "Workshop agenda",
    short:
      "The output document that pre-sorts everything into: deviations needing design, items to discuss, and standards to fast-confirm.",
    why: "It turns the client's answers directly into a ready-to-run workshop plan.",
    related: ["workshop", "fast-confirm", "deviation"],
  },
  excluded: {
    term: "Excluded",
    short:
      "Rows kept for the audit trail but hidden from the client — e.g. questions that don't apply.",
    why: "Nothing is deleted; out-of-scope items are just hidden, so the record stays complete and auditable.",
    related: ["flagged"],
  },
  flagged: {
    term: "Flagged (config how-to)",
    short:
      "A question SAP phrased as a technical config how-to rather than a real business decision, marked for the consultant to move out.",
    why: "Keeps the client's list to genuine business decisions and pushes technical setup to where it belongs.",
    related: ["l3-configuration", "excluded"],
  },
  "mandatory-my": {
    term: "Malaysia-mandatory (MY)",
    short: "A process step that is legally or operationally mandatory for Malaysia specifically.",
    why: "Country rules differ; MY-mandatory steps can't be skipped for a Malaysian rollout.",
    related: ["scope-item"],
  },
  "fiori-app": {
    term: "Fiori app",
    short: "The name of the SAP screen or app ('Fiori' is SAP's user interface) used for a step.",
    why: "It shows concretely which SAP app a user would open to perform each step in the process.",
    related: ["scope-item"],
  },
  "consultant-added": {
    term: "Consultant-added",
    short: "A custom question the consultant wrote themselves, not from SAP's library.",
    why: "Lets consultants cover gaps that SAP's standard questions miss.",
    related: ["l2-question"],
  },
  "pending-curation": {
    term: "Pending curation",
    short:
      "Consultant review that hasn't happened yet — an item's placement or wording is still an automatic suggestion.",
    why: "Flags where a human still needs to confirm or correct the machine's suggestion before it's trusted.",
    related: ["consultant-added"],
  },
};

/** Ordered keys for the glossary drawer (grouped loosely by journey). */
export const GLOSSARY_ORDER: GlossaryKey[] = [
  "fit-to-standard",
  "s4hana-cloud-public",
  "pre-onboarding",
  "workshop",
  "value-stream",
  "sub-process",
  "scope-item",
  "foundation",
  "affirm-bundle",
  "affirm-set",
  "l2-question",
  "l3-configuration",
  "bdc",
  "sscui",
  "sap-verbatim",
  "decision-question",
  "information-question",
  "adopt-standard",
  "discuss-in-workshop",
  "deviation",
  "fast-confirm",
  "bundle-lifecycle",
  "draft",
  "issued",
  "sealed",
  "released",
  "signed-record",
  "workshop-agenda",
  "excluded",
  "flagged",
  "consultant-added",
  "pending-curation",
  "mandatory-my",
  "fiori-app",
];

/** Case-insensitive lookup of a glossary key by its display term. */
export function glossaryKeyForTerm(term: string): GlossaryKey | null {
  const needle = term.trim().toLowerCase();
  for (const key of GLOSSARY_ORDER) {
    if (AFFIRM_GLOSSARY[key].term.toLowerCase() === needle) return key;
  }
  return null;
}
