/**
 * The disabled-control contract, in one place.
 *
 * TWO RULES, both from the handoff's component contracts, where they sit beside
 * the glyph rule as "component contracts, not styling preferences":
 *
 *   1. The reason is a SIBLING STRING, never a `title` attribute. A tooltip is
 *      unreachable by touch and by keyboard and is not reliably announced, so a
 *      reason that lives there is a reason only some people can have. The
 *      existing console does exactly this in places —
 *      `src/components/sap/capability/StatusBadge.tsx` carries every
 *      explanation in a `tip` prop — which is why this is written down rather
 *      than assumed.
 *
 *   2. The control STAYS IN THE TAB ORDER. The `disabled` attribute removes an
 *      element from the tab order entirely, so a keyboard user tabs straight
 *      past the thing they cannot use and never learns why it is unavailable or
 *      who to ask. `aria-disabled` announces the state and keeps the tab stop;
 *      the interaction is refused in the handler instead.
 *
 * Every CoreEdge control with a disabled state goes through this, so the rules
 * hold in one place rather than three, and
 * `tests/unit/coreedge/components.test.ts` checks that no component under
 * `src/components/coreedge/` reaches for `disabled=` or `title=` directly.
 */

export interface BlockedControlProps {
  readonly "aria-disabled": "true";
  readonly "aria-describedby"?: string;
  readonly onClick: (event: { preventDefault: () => void }) => void;
}

/**
 * Props for a control that cannot currently be used.
 *
 * `reasonId` is omitted rather than set to undefined when there is no reason to
 * point at — the repo runs `exactOptionalPropertyTypes`, and an explicit
 * `undefined` would render `aria-describedby=""`, pointing assistive technology
 * at nothing.
 */
export function blockedControlProps(reasonId: string | null): BlockedControlProps {
  return {
    "aria-disabled": "true",
    ...(reasonId === null ? {} : { "aria-describedby": reasonId }),
    onClick: (event) => event.preventDefault(),
  };
}

/** The id convention, so a control and its reason cannot drift apart. */
export function reasonIdFor(controlId: string): string {
  return `${controlId}-reason`;
}
