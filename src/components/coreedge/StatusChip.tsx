import type { ReactNode } from "react";

import {
  APP_CHIP_GLYPHS,
  APP_STATUS_VOCABULARY,
  GATE_GLYPHS,
  LANE_STATUS_VOCABULARY,
  type AppStatus,
  type GateToken,
  type LaneStatus,
} from "@/lib/coreedge/status-vocabulary";

/**
 * StatusChip — a lane or app status, as words.
 *
 * THE GLYPH IS NOT OPTIONAL and there is no prop to remove it. PR-1 measured
 * why: in dark mode the fifteen pairwise contrasts between the six status
 * grounds sit between 1.01:1 and 1.10:1, so colour alone does not distinguish
 * them — for anyone, not only for colour-blind users. The glyph carries the
 * meaning and the colour agrees with it.
 *
 * The status is also the LABEL. A caller passes `status`, never `label`, so two
 * screens cannot call the same condition different things — the failure the
 * audit found nine times over.
 *
 * `age` is rendered beside the chip rather than inside it, because "Live" is a
 * claim about the past: it means proven as of the age shown. A Live chip with no
 * age is a claim with no evidence behind it.
 *
 * That sentence used to end "…so `title` says so where a caller omits one".
 * There is no `title` here and there never was — and there must not be: this
 * folder's contract is that an explanation is a sibling string a keyboard user
 * can reach, never a `title` only a mouse discovers. The claim is deleted
 * rather than implemented. What the component actually does is announce the
 * age when it has one; a caller that omits it renders a chip with no evidence
 * beside it, visibly and audibly.
 */

const TONE: Readonly<Record<GateToken | "status-expired", string>> = {
  "gate-ok": "bg-gate-ok-bg text-gate-ok-fg",
  "gate-info": "bg-gate-info-bg text-gate-info-fg",
  "gate-wait": "bg-gate-wait-bg text-gate-wait-fg",
  "gate-bad": "bg-gate-bad-bg text-gate-bad-fg",
  "gate-off": "bg-gate-off-bg text-gate-off-fg",
  "status-expired": "bg-status-expired-bg text-status-expired-fg",
};

const BASE =
  "inline-flex items-center gap-[0.375em] rounded-full px-[0.625em] py-[0.1875em] " +
  "text-xs font-medium leading-normal whitespace-nowrap";

/** The glyph carries meaning, so it is never announced as decorative. */
function Glyph({ glyph }: { glyph: string }): ReactNode {
  return (
    <span aria-hidden="true" className="font-semibold">
      {glyph}
    </span>
  );
}

export interface StatusChipProps {
  readonly status: LaneStatus;
  /** "2 m ago". Rendered beside the chip; a Live chip without one is unproven. */
  readonly age?: string;
  /**
   * Only pass this when the chip really navigates somewhere. A chip that looks
   * clickable and is not is worse than a plain one.
   */
  readonly onClick?: () => void;
}

export function StatusChip({ status, age, onClick }: StatusChipProps): ReactNode {
  const def = LANE_STATUS_VOCABULARY[status];
  const glyph = GATE_GLYPHS[def.token];
  const chip = (
    <span className={`${BASE} ${TONE[def.token]}`}>
      <Glyph glyph={glyph} />
      {def.label}
    </span>
  );

  const body =
    onClick === undefined ? (
      chip
    ) : (
      <button
        type="button"
        onClick={onClick}
        className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy hover:opacity-80"
      >
        {chip}
      </button>
    );

  return (
    <span className="inline-flex items-baseline gap-2">
      {/*
        * Read aloud as one phrase: "✕ No access. No approved access for…,
        * checked 4 minutes ago."
        *
        * THE AGE IS ANNOUNCED. It used to sit only inside the aria-hidden
        * wrapper below, so a screen reader heard the status and its meaning
        * while the one fact that says whether to believe it — how old the
        * check is — was silent. "Age of proof" is the product's central claim
        * (handoff §4), and a claim only sighted users can hear is not a claim
        * the product makes.
        */}
      <span className="sr-only">
        {glyph === "✓" ? "Live" : def.label}. {def.means}
        {age === undefined ? "" : `, checked ${age}.`}
      </span>
      <span aria-hidden="true" className="inline-flex items-baseline gap-2">
        {body}
        {age === undefined ? null : <span className="text-xs text-ink-muted">{age}</span>}
      </span>
    </span>
  );
}

export interface AppStatusChipProps {
  readonly status: AppStatus;
}

/**
 * The app-level chip. Separate component, not a variant, because DECISION D3
 * turns on app statuses never being lane statuses: Restricted is an app chip and
 * never a nineteenth lane status, and a shared component with a union prop is
 * how that distinction gets lost six months from now.
 */
export function AppStatusChip({ status }: AppStatusChipProps): ReactNode {
  const def = APP_STATUS_VOCABULARY[status];
  return (
    <span className={`${BASE} ${TONE[def.token]}`}>
      <Glyph glyph={APP_CHIP_GLYPHS[def.token]} />
      {def.label}
    </span>
  );
}
