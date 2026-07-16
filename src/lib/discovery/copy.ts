/**
 * ABeam Workbench — Neutral Process Discovery client-facing copy.
 *
 * Every string the brief specifies verbatim, in one place. Centralised so the
 * copy is auditable against §10 in one read, and so a unit test can assert the
 * exact strings rather than trusting a component's JSX.
 *
 * Rule: nothing is invented here. If the brief does not specify a string, it
 * does not get a constant — it gets a decision logged in BUILD-LOG first.
 */

/** §10 "Verbatim promises (use exactly)". */
export const PROMISE_HERO = "Your business on one page — before you pick a system.";
export const PROMISE_V3 = "See how the standard runs your process, then tell us where you differ.";
export const PROMISE_NOT_COMMITTED = "Nothing is committed — this is discovery, not a decision.";

/** §10 differ expectation note, verbatim. */
export const DIFFER_EXPECTATION_NOTE =
  "Noted — a difference here usually means extra build and testing, whichever product you choose. We'll size it in the workshop. Nothing is committed.";

/**
 * §10 provenance (client-facing), verbatim — including the second sentence,
 * which §6/12's shorter form drops.
 *
 * The brief conflicts with itself here: §6/12 specifies
 * "SOURCE: ESTABLISHED ERP BEST-PRACTICE REFERENCES · CURATED BY ABEAM ·
 * RENDERED PRODUCT-NEUTRAL" (mono 10 UPPERCASE, dot-separated, no second
 * sentence), while §10 lists the sentence-case form below under "use exactly".
 *
 * Resolution (BUILD-LOG conflict #12): §10 wins the STRING — it is the
 * use-exactly list, and its second sentence is the whole point of the line
 * ("the reference names no vendor" is the product-agnostic promise stated out
 * loud). §6/12 wins the STYLE — mono, 10px, muted, shown never hidden. It is not
 * force-uppercased: shouting a two-sentence promise would mangle it, and §6/12's
 * uppercase was specified for its own shorter form.
 */
export const PROVENANCE_CLIENT =
  "Source: established ERP best-practice references, curated by ABeam and rendered product-neutral. The process is yours; the reference names no vendor.";

/** §10 fallback, verbatim — the 197 no-flow processes. */
export const NO_FLOW_FALLBACK =
  "No step flow is catalogued for this process yet — we'll map it with you.";

/** §6/19 footnote, verbatim. The .dc appends "Click a step for detail."; brief wins (conflict #9). */
export const FLOW_FOOTNOTE =
  "Steps are the standard happy-path; roles indicative — refine with client.";

/** §7 V1 all-reviewed banner, verbatim. */
export const ALL_REVIEWED_BANNER = "Every stream reviewed — ready for the workshop.";

/** The blank-role lane (§6/19). 46% of steps carry no role. */
export const SYSTEM_LANE = "System / Automatic";

// ─── V3 decision block ───────────────────────────────────────────────────────

export const FIT_PROMPT = "How does this fit?";
export const STANDARD_BOX_LABEL = 'What "runs as standard" means here';
export const STANDARD_BOX_BODY =
  "The steps above happen in this order, with no extra approvals, fields, or systems layered on top.";
export const DIFFER_BOX_LABEL = "Why we differ";
export const DIFFER_PLACEHOLDER = "Tell us how this really runs for you…";
export const DISCUSS_PARKED_NOTE = "Parked for the workshop agenda.";
export const SUBSTEP_EMPTY = "No further detail captured for this step.";
export const OPTIONAL_TAG = "optional";

// ─── V2 ──────────────────────────────────────────────────────────────────────

export const SEARCH_PLACEHOLDER = "Search processes…";
export const CARD_NO_FLOW_CAPTION = "No step flow catalogued";
export const STREAM_COMPLETE_BANNER = "Every process in this stream reviewed.";

// ─── V4 ──────────────────────────────────────────────────────────────────────

export const BUCKET_EMPTY = "None yet.";
export const DIFFER_NO_REASON = "No reason captured yet.";
export const EXPORT_CTA = "Export the pack";

// ─── Sealed ──────────────────────────────────────────────────────────────────

export const SEALED_NOTICE =
  "Your review is sealed and read-only. Everything below is what you shared with us.";
