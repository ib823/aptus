"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * One UTC instant, rendered in the READER'S zone with the zone named.
 *
 * Handoff §4, Time: "Store one UTC instant; render in the reader's zone with
 * the zone named… Relative time is a helper, never the fact." The lane detail
 * printed `checkedAt.toISOString()` — "checked 2026-09-11T09:39:00.000Z" — which
 * is the stored instant leaking onto the screen. A reader in MYT then has to do
 * timezone arithmetic to answer "is this recent", which is the one question the
 * line exists to answer.
 *
 * WHY A CLIENT COMPONENT. The reader's zone is a property of the reader's
 * browser and is not knowable on the server. Rendering the server's zone and
 * calling it the reader's would be a worse lie than the ISO string, because it
 * looks correct. So the server renders UTC — named as UTC, so it is never
 * mistaken for local — and the browser replaces it with the reader's zone after
 * hydration. Both states are true when read; neither is a guess.
 *
 * The relative age is the HELPER and sits second, in parentheses, exactly as §4
 * requires. It is never the only thing shown: "4 minutes ago" cannot be checked
 * against a log, and a timestamp can.
 *
 * WHY IT LIVES UNDER primitives/ RATHER THAN BESIDE THE FOURTEEN. The handoff's
 * component inventory is a closed set — "everything in the designs is one of
 * these, nothing is bespoke to a screen" — and a test asserts the folder holds
 * exactly those fourteen. This is a formatting primitive, not a new entry in
 * the design vocabulary, so it sits one level down where it cannot dilute that
 * claim.
 */

export interface ProvenAtProps {
  /** The stored instant, ISO 8601, UTC. */
  readonly iso: string;
  /** The relative age, already computed — "4 minutes ago", "never checked". */
  readonly age: string;
}

function format(iso: string, timeZone: string | undefined): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}

export function ProvenAt({ iso, age }: ProvenAtProps): ReactNode {
  // Server and first paint: UTC, named. After hydration: the reader's own zone.
  // Starting from the browser's zone would mismatch the server's HTML and
  // produce a hydration warning on every page that renders a timestamp.
  const [timeZone, setTimeZone] = useState<string | undefined>("UTC");

  useEffect(() => {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved) setTimeZone(resolved);
  }, []);

  return (
    <span>
      {format(iso, timeZone)} <span className="text-ink-muted">({age})</span>
    </span>
  );
}
