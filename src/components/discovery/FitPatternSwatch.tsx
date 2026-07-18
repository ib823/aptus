/**
 * ABeam Workbench — Export decision swatch: PATTERN + TEXT LABEL.
 *
 * Brief §11, verbatim: "Decisions never rely on color alone — every fit state
 * carries a text label and, in Export, a fill pattern (teal=solid, amber=diagonal,
 * blue=dots, gray=open). Colorblind-safe by construction."
 *
 * The pack prints black-on-white, so the pattern is the ONLY visual carrier and
 * the label is the actual answer. Patterns are inline SVG `<pattern>` fills —
 * they survive print (no CSS background-image dropping, no rasterisation) and
 * keep the text selectable beside them.
 *
 * Mapping (§11's four, mapped to our states):
 *   standard → solid      differ → diagonal
 *   discuss  → dots       na/open → open (outline only)
 */

import { FIT_LABELS, type FitState } from "@/lib/discovery/fit";

type PatternKind = "solid" | "diagonal" | "dots" | "open";

const PATTERN_FOR: Record<FitState, PatternKind> = {
  standard: "solid",
  differ: "diagonal",
  discuss: "dots",
  na: "open",
  open: "open",
};

/**
 * Stable ids per kind — the defs are emitted once per swatch, which is fine for
 * a print document and avoids a document-level singleton.
 *
 * Every fill/stroke is `currentColor` or `none`: the black-on-white palette is
 * declared ONCE, in discovery-export.css scoped to .dx-root (the sanctioned
 * exception to the token rule). Hardcoding the print colours here would put raw
 * hex in a component the stray-hex guard scans — and would break the swatch if
 * it were ever reused outside the pack.
 */
function PatternDefs({ id, kind }: { id: string; kind: PatternKind }) {
  if (kind === "diagonal") {
    return (
      <defs>
        <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" strokeWidth="2" />
        </pattern>
      </defs>
    );
  }
  if (kind === "dots") {
    return (
      <defs>
        <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="currentColor" />
        </pattern>
      </defs>
    );
  }
  return null;
}

export interface FitPatternSwatchProps {
  state: FitState;
  /** Rendered beside the swatch. The label IS the answer; the pattern reinforces. */
  showLabel?: boolean;
}

export function FitPatternSwatch({ state, showLabel = true }: FitPatternSwatchProps) {
  const kind = PATTERN_FOR[state];
  const id = `pat-${state}-${kind}`;
  const fill = kind === "solid" ? "currentColor" : kind === "open" ? "none" : `url(#${id})`;

  return (
    <span className="dx-swatch-row">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="dx-swatch">
        <PatternDefs id={id} kind={kind} />
        <rect x="0.5" y="0.5" width="11" height="11" fill={fill} stroke="currentColor" strokeWidth="1" />
      </svg>
      {showLabel ? <span>{FIT_LABELS[state]}</span> : <span className="dx-sr">{FIT_LABELS[state]}</span>}
    </span>
  );
}

/** The legend that makes the patterns readable — every pack page group needs it once. */
export function FitPatternLegend() {
  return (
    <ul className="dx-legend">
      {(["standard", "differ", "discuss", "na", "open"] as FitState[]).map((s) => (
        <li key={s}>
          <FitPatternSwatch state={s} />
        </li>
      ))}
    </ul>
  );
}
