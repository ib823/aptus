/**
 * ABeam Workbench — the persistent context chip (brief §9.1, §6B.12, §4.3).
 *
 * §9.1: "Persistent context chip tells the consultant whether the current
 * surface is internal-only or paired with a client projection."
 *
 * That sentence is the whole specification, and it is why this is not a single
 * constant. The .dc computes the chip as: "Live session — {client}" during
 * facilitation, "Session setup" on sessions, and **"Editing library" as the
 * default for everything else** — so it reads "Editing library" while the fenced
 * product map is on screen. A chip whose job is to say "you are on an
 * internal-only surface" instead says you are editing the library, on the one
 * view where being wrong matters most. Logged as D15.
 *
 * "Editing library" remains the default, as instructed. Views that are not that
 * pass their own.
 */

export type ContextKind = "library" | "consultant-only" | "live";

export interface ContextChipProps {
  kind?: ContextKind;
  /** Client label for the live variant. Never a fixture. */
  client?: string | null | undefined;
}

const STYLES: Record<ContextKind, string> = {
  library: "bg-navy-soft text-navy",
  // The fence's own palette, so the chip matches the banner beneath it.
  "consultant-only": "bg-banner-warn text-decision-custom",
  live: "bg-cta-focus text-cta",
};

export function ContextChip({ kind = "library", client }: ContextChipProps) {
  const label =
    kind === "live"
      ? `Live session — ${client ?? "client"}`
      : kind === "consultant-only"
        ? "Consultant only — not shared"
        : "Editing library";

  return (
    <p
      className={`inline-flex h-[22px] items-center rounded-pill px-2.5 text-[11px] font-bold ${STYLES[kind]}`}
    >
      {/* The chip is a live region: it is the consultant's standing answer to
          "can the client see this?", and it changes under them on navigation. */}
      <span aria-live="polite">{label}</span>
    </p>
  );
}
