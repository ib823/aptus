/**
 * ReadinessScorecard — % of the probeable runtime surface that is ACTIVATED.
 *
 * HONEST metric (contract §4): counts DISCRETE probeable runtime services
 * (activated / probeable), never the grouped itemCount sum. The denominator is
 * shown plainly ("N of M runtime services activated") — no Phase-0 inflation.
 * Colour via var(--token) only.
 */

/** activated / probeable as a 0–100 integer (0 when nothing is probeable). */
export function readinessPercent(activated: number, probeable: number): number {
  if (probeable <= 0) return 0;
  return Math.round((activated / probeable) * 100);
}

function CountPill({ label, value, bg, fg }: { label: string; value: number; bg: string; fg: string }) {
  return (
    <div
      className="flex items-center justify-between rounded-[var(--radius-pill)] px-3 py-1.5"
      style={{ background: bg, color: fg }}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

export function ReadinessScorecard({
  activated,
  probeable,
  available,
  reference,
}: {
  activated: number;
  probeable: number;
  available: number;
  reference: number;
}) {
  const pct = readinessPercent(activated, probeable);
  return (
    <section
      aria-label="Tenant readiness"
      className="rounded-[var(--radius-card-warm)] p-5"
      style={{ background: "var(--surface-paper)", border: "1px solid var(--border-default)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: "var(--brand-navy)" }}>
          Tenant readiness
        </h3>
        <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
          probeable runtime services (APIs + CDS via OData) — excludes events &amp; grouped CDS
        </span>
      </div>

      <div className="mt-3 flex items-end gap-3">
        <div className="text-3xl font-bold tabular-nums" style={{ color: "var(--brand-navy)" }}>
          {pct}%
        </div>
        <div className="pb-1 text-sm" style={{ color: "var(--ink-secondary)" }}>
          <strong className="tabular-nums" style={{ color: "var(--ink-primary)" }}>
            {activated.toLocaleString()}
          </strong>{" "}
          of{" "}
          <strong className="tabular-nums" style={{ color: "var(--ink-primary)" }}>
            {probeable.toLocaleString()}
          </strong>{" "}
          runtime services activated
        </div>
      </div>

      {/* progress: fill brand-navy on an ink-tint track */}
      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-[var(--radius-pill)]"
        style={{ background: "var(--surface-ink-tint)" }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-[var(--radius-pill)]" style={{ width: `${pct}%`, background: "var(--brand-navy)" }} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <CountPill label="Activated" value={activated} bg="var(--status-signed-bg)" fg="var(--status-signed-fg)" />
        <CountPill label="Available" value={available} bg="var(--status-sent-bg)" fg="var(--status-sent-fg)" />
        <CountPill label="Reference" value={reference} bg="var(--status-draft-bg)" fg="var(--status-draft-fg)" />
      </div>
    </section>
  );
}
