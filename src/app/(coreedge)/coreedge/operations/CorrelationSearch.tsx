import type { ReactNode } from "react";

import type { CorrelationOutcome } from "@/lib/coreedge/correlation-lookup";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";

/**
 * Operations · find one call by its correlation id (P0.14).
 *
 * Every broker answer carries an `x-correlation-id`, and every refusal says
 * "quote this id". This is where the id is pasted: the call's outcome, the
 * hop it stopped at, and what it touched, read from the audit row through
 * correlation-lookup.ts. Scoped to the viewer's organization by the lookup
 * itself — the organization leads the index the query runs on — so an id from
 * another organization reads exactly like a wrong one.
 *
 * NO PAYLOAD. The audit row holds none, and this shows a row count, never a
 * row.
 *
 * A plain GET form, so it works without script and the URL of an answer can
 * be shared with whoever needs to see it (who must belong to the same
 * organization to see anything).
 *
 * COLOUR. Only the theme's own tokens (ink, paper, the default and strong
 * borders), each defined for light and dark, so both modes keep AA contrast.
 * The navy button style is deliberately not used here (its dark-mode pair is
 * a known defect).
 */

const HOP_LABELS: Readonly<Record<NonNullable<Extract<CorrelationOutcome, { kind: "found" }>["call"]["brokenHop"]>, string>> = {
  key: "the key or its rate limit",
  access: "the access grant",
  binding: "the SAP connection",
  sapMetadata: "SAP's service description",
  sapDataRead: "SAP's answer to the read",
};

export function CorrelationSearch({
  query,
  outcome,
}: {
  readonly query: string;
  readonly outcome: CorrelationOutcome | null;
}): ReactNode {
  return (
    <section
      aria-labelledby="correlation-search-heading"
      className="flex flex-col gap-3 rounded-[var(--radius-card-warm)] border border-[color:var(--border-default)] bg-paper p-4"
    >
      <h2 id="correlation-search-heading" className="text-sm font-medium text-ink">
        Find a call by its correlation id
      </h2>
      <form method="get" action="/coreedge/operations" role="search" className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-ink">
          Correlation id
          <input
            type="search"
            name="correlationId"
            defaultValue={query}
            spellCheck={false}
            autoComplete="off"
            placeholder="e.g. 3f0c9a1e-…"
            className="rounded-[var(--radius-input)] border border-[color:var(--border-strong)] bg-paper px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
          />
        </label>
        <button
          type="submit"
          className="rounded-[var(--radius-input)] border border-[color:var(--border-strong)] bg-paper px-4 py-2 text-sm font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
        >
          Find
        </button>
      </form>
      <div aria-live="polite">{outcome === null ? null : <CorrelationAnswer outcome={outcome} />}</div>
    </section>
  );
}

function CorrelationAnswer({ outcome }: { readonly outcome: CorrelationOutcome }): ReactNode {
  if (outcome.kind === "not-found") {
    return (
      <p className="max-w-prose text-sm text-ink-soft">
        No call in this organization has that correlation id. Check it was copied whole; an id from another
        organization is not shown here.
      </p>
    );
  }
  if (outcome.kind === "outside-window") {
    return (
      <p className="max-w-prose text-sm text-ink-soft">
        That call is older than {outcome.windowDays} days, so its evidence is outside the lookup window.
      </p>
    );
  }
  const { call } = outcome;
  const rows: readonly [string, string][] = [
    ["When", call.at.toISOString().replace("T", " ").slice(0, 19) + " UTC"],
    ["Outcome", call.outcome],
    ["HTTP status", String(call.status)],
    ["Stopped at", call.brokenHop === null ? "Nowhere: the call succeeded" : HOP_LABELS[call.brokenHop]],
    ["Operation", call.operation],
    ["Service", call.externalId],
    ["Environment", call.environment === null ? call.environmentRaw : ENVIRONMENT_LABELS[call.environment]],
    ["Rows", call.rowCount === null ? "None recorded" : String(call.rowCount)],
    ["Took", call.durationMs === null ? "Not sent to SAP" : `${call.durationMs} ms`],
    ["Source", call.dryRun ? "Test Console or console read (not billed)" : "Deployed application"],
  ];
  return (
    <dl className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-ink-soft">{term}</dt>
          <dd className="text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
