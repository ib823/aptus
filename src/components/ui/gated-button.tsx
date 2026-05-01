"use client";

/**
 * GatedButton — a Button that is *softly* disabled.
 *
 * Differs from a plain `<Button disabled>` in three ways:
 *
 *   1. Uses `aria-disabled="true"` instead of the native `disabled` attribute.
 *      This keeps the button focusable and clickable, so we can intercept the
 *      click and **help** the user (e.g. scroll to the field that's blocking
 *      submission) instead of silently swallowing the event.
 *
 *   2. The disabled reason is announced to screen readers via
 *      `aria-describedby`, and shown as a tooltip on **hover and focus**
 *      (a plain `title=` only fires on mouse hover).
 *
 *   3. Visually identical to a real disabled button (opacity, cursor) so
 *      sighted users get the same affordance.
 *
 * Use this for any primary CTA whose enablement depends on user-controlled
 * state (form completeness, profile gates, multi-step wizards, etc.). For
 * truly inert buttons (e.g. a paginator's "Next" when on the last page),
 * keep using `<Button disabled>`.
 *
 * @example
 *   <GatedButton
 *     gated={profile.score < 60}
 *     gatedReason="Reach 60% profile completeness to continue."
 *     onGatedClick={scrollToFirstIncompleteSection}
 *     onClick={handleContinue}
 *   >
 *     Continue
 *   </GatedButton>
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ButtonElProps = Omit<
  React.ComponentProps<typeof Button>,
  "aria-disabled" | "aria-describedby"
>;

interface GatedButtonProps extends ButtonElProps {
  /**
   * When true, the button is in the "soft-disabled" state: visually muted,
   * announces aria-disabled, shows the tooltip, and routes clicks to
   * `onGatedClick` instead of `onClick`. Distinct from the native `disabled`
   * prop — use `gated` for user-resolvable gates (validation, profile gates),
   * and `disabled` for transient async states (submitting, loading).
   */
  gated: boolean;
  /**
   * Human-readable explanation shown in the tooltip and announced via
   * aria-describedby. Required for accessibility when `gated` is true.
   */
  gatedReason?: string;
  /**
   * Click handler invoked when the user clicks while `gated` (and not also
   * `disabled`). Use this to help the user resolve the gate — e.g. scroll
   * to the first incomplete field, open the missing-step accordion, focus
   * an input. If omitted, the click is just swallowed.
   */
  onGatedClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

let reasonIdCounter = 0;

function GatedButton({
  gated,
  gatedReason,
  onGatedClick,
  onClick,
  disabled,
  type,
  children,
  className,
  ...rest
}: GatedButtonProps) {
  // When gated, downgrade `type="submit"` to `"button"` so the form's Enter
  // key (or implicit submit) cannot bypass the gate. The intercepted click
  // is the only way through. Spread (not assign) under exactOptionalPropertyTypes.
  const typeProp = gated && type === "submit" ? { type: "button" as const } : type ? { type } : {};
  // Stable id for aria-describedby (created once per mount).
  const describedById = React.useMemo(
    () => `gated-reason-${++reasonIdCounter}`,
    [],
  );

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return; // Native disabled wins; no click should fire.
      if (gated) {
        // Soft-disabled: route to the gate-helper instead of the real handler.
        event.preventDefault();
        onGatedClick?.(event);
        return;
      }
      onClick?.(event);
    },
    [disabled, gated, onClick, onGatedClick],
  );

  // Hard-disabled (transient async state) wins over soft-gated. Render plain
  // Button with the native disabled attribute — no tooltip, no help.
  if (disabled) {
    return (
      <Button disabled {...typeProp} className={className} {...rest}>
        {children}
      </Button>
    );
  }

  // When gated, render with Tooltip so the reason appears on hover + focus.
  // When not gated, render the bare Button (no tooltip overhead).
  if (!gated) {
    return (
      <Button onClick={handleClick} {...typeProp} className={className} {...rest}>
        {children}
      </Button>
    );
  }

  // Build the soft-disabled visual + a11y state.
  // We deliberately do NOT pass the native `disabled` attribute, because that
  // would block click events (defeating onGatedClick).
  const button = (
    <Button
      aria-disabled="true"
      aria-describedby={gatedReason ? describedById : undefined}
      onClick={handleClick}
      {...typeProp}
      // Visual parity with disabled: opacity 50%, not-allowed cursor (the
      // global @layer base rule in globals.css already maps aria-disabled
      // to cursor:not-allowed; this className is belt-and-suspenders).
      className={`opacity-50 cursor-not-allowed hover:bg-primary/90 ${className ?? ""}`}
      {...rest}
    >
      {children}
    </Button>
  );

  if (!gatedReason) return button;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top">
          <span id={describedById}>{gatedReason}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { GatedButton };
export type { GatedButtonProps };
