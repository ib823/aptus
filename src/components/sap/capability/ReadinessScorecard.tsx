/**
 * ReadinessScorecard — how many services the tenant demonstrably exposes.
 *
 * HONEST metric (agreed): the headline is the real exposed count from the SAME
 * curated-first probe the Tenant Capabilities panel uses — "N activated of
 * {probed} tested" — labelled as a probe SAMPLE, not a ratio over the whole
 * catalogue. Catalogue scale (APIs / probeable OData V2 / other types) is shown
 * separately; no percentage over 128 or 941. Colour via var(--token) only.
 */

/** activated / probed as a 0–100 integer (0 when nothing was probed). */
export function readinessPercent(activated: number, probed: number): number {
  if (probed <= 0) return 0;
  return Math.round((activated / probed) * 100);
}

function CountPill({ label, value, bg, fg }: { label: string; value: number; bg: string; fg: string }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-pill)] px-3 py-1.5" style={{ background: bg, color: fg }}>
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

export function ReadinessScorecard({
  activated,
  dataConfirmed,
  dataProbe,
  needsSetup,
  notChecked,
  notProbeable,
  probed,
  probeable,
  apiTotal,
  reference,
  lastProbedAt,
}: {
  activated: number;
  dataConfirmed: number;
  dataProbe: boolean;
  needsSetup: number;
  notChecked: number;
  notProbeable: number;
  probed: number;
  probeable: number;
  apiTotal: number;
  reference: number;
  lastProbedAt?: string | null;
}) {
  const pct = readinessPercent(activated, probed);
  return (
    <section
      aria-label="Tenant readiness"
      className="rounded-[var(--radius-card-warm)] p-5"
      style={{ background: "var(--surface-paper)", border: "1px solid var(--border-default)" }}
    >
      <h3 className="text-sm font-semibold" style={{ color: "var(--brand-navy)" }}>
        Tenant readiness
      </h3>

      <div className="mt-2 flex items-end gap-3">
        <div className="text-3xl font-bold tabular-nums" style={{ color: "var(--brand-navy)" }}>
          {activated.toLocaleString()}
        </div>
        <div className="pb-1 text-sm" style={{ color: "var(--ink-secondary)" }}>
          authorized of{" "}
          <strong className="tabular-nums" style={{ color: "var(--ink-primary)" }}>
            {probed.toLocaleString()}
          </strong>{" "}
          probed{" "}
          <span style={{ color: "var(--ink-muted)" }}>
            {probed > 0
              ? lastProbedAt
                ? `(stored · last probed ${new Date(lastProbedAt).toLocaleString()})`
                : "(stored probe)"
              : "(not probed yet — run “Probe all”)"}
          </span>
        </div>
      </div>

      {/* Authorized ($metadata reachable) vs Data-confirmed (a live 1-row read). */}
      <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
        {dataProbe ? (
          <>
            <strong style={{ color: "var(--status-signed-fg)" }}>{dataConfirmed.toLocaleString()}</strong> data-confirmed
            (read a live row) · <strong style={{ color: "var(--ink-secondary)" }}>{activated.toLocaleString()}</strong> authorized
            ($metadata reachable)
          </>
        ) : (
          <>Authorized = $metadata reachable. Enable “Confirm data reads” to also count data-confirmed (a live 1-row read).</>
        )}
      </p>

      {/* progress: activated / probed (probe sample), fill navy on ink-tint */}
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

      {/* catalogue scale — shown separately, never folded into the ratio */}
      <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>
        Catalogue scale: <strong style={{ color: "var(--ink-secondary)" }}>{apiTotal.toLocaleString()}</strong> APIs ·{" "}
        <strong style={{ color: "var(--ink-secondary)" }}>{probeable.toLocaleString()}</strong> OData probeable (V2 + best-effort V4) ·
        other content types pending real exports
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <CountPill label="Authorized" value={activated} bg="var(--status-signed-bg)" fg="var(--status-signed-fg)" />
        <CountPill label="Needs setup" value={needsSetup} bg="var(--status-awaiting-bg)" fg="var(--status-awaiting-fg)" />
        <CountPill label="Not checked" value={notChecked} bg="var(--surface-ink-tint)" fg="var(--ink-secondary)" />
        <CountPill label="Not probeable" value={notProbeable} bg="var(--status-expired-bg)" fg="var(--status-expired-fg)" />
        <CountPill label="Reference" value={reference} bg="var(--status-draft-bg)" fg="var(--status-draft-fg)" />
      </div>
    </section>
  );
}
