/**
 * ReadinessScorecard — how many services the tenant demonstrably exposes.
 *
 * HONEST metric (agreed): the headline is the real exposed count from the SAME
 * curated-first probe the Tenant Capabilities panel uses — "N activated of
 * {probed} tested" — labelled as a probe SAMPLE, not a ratio over the whole
 * catalogue. Catalogue scale (APIs / probeable OData V2 / other types) is shown
 * separately; no percentage over 128 or 941. Colour via var(--token) only.
 */

import { formatDateTime } from "@/lib/format/date";

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
  notFound,
  notChecked,
  notProbeable,
  available,
  probed,
  probeable,
  apiTotal,
  reference,
  deprecated = 0,
  totalItems,
  aiApis,
  lastProbedAt,
}: {
  activated: number;
  dataConfirmed: number;
  dataProbe: boolean;
  needsSetup: number;
  /** A probe returned 404 — published, but the path is not on this tenant. */
  notFound: number;
  notChecked: number;
  notProbeable: number;
  /** Published for this edition but not yet probed on this tenant. */
  available: number;
  probed: number;
  probeable: number;
  apiTotal: number;
  reference: number;
  /** 2608 WS3 — deprecated by SAP (Hub State), tenant-independent; never counted as Authorized. */
  deprecated?: number;
  /** Total items across all content types (grouped rows counted by itemCount). */
  totalItems?: number;
  /** AI-domain API count, surfaced separately from the S/4 API total. */
  aiApis?: number;
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
                ? `(stored · last probed ${formatDateTime(lastProbedAt)})`
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
        Catalogue scale:{" "}
        <strong style={{ color: "var(--ink-secondary)" }}>{(totalItems ?? apiTotal).toLocaleString()}</strong> items across 12 content
        types · <strong style={{ color: "var(--ink-secondary)" }}>{probeable.toLocaleString()}</strong> OData-probeable (V2 + best-effort
        V4){aiApis ? <> · <strong style={{ color: "var(--ink-secondary)" }}>{aiApis.toLocaleString()}</strong> AI APIs</> : null} · the
        rest reference
      </p>

      {/*
        EVERY BUCKET, so the row adds up to the browsable total.

        This has gone wrong twice, the same way each time. First `available`
        was passed nowhere and rendered nowhere, so the pills summed to 1,822
        while the status filter above them offered 1,973 — a reader could
        subtract and get 151 items that exist, are filterable, and appear in no
        summary. The fix added a comment saying "every bucket"… and the row was
        still missing NOT_FOUND, so any 404 probe result made the stated sum
        false all over again. The vocabulary has EIGHT members (DEPRECATED
        joined in 2608 WS3); this row renders all eight, and the reconciliation
        sentence below is only ever computed over the same eight. On a screen whose whole argument is
        "nothing is inferred, every number traces to a probe", a silently
        missing bucket is the worst kind of error.
      */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <CountPill label="Authorized" value={activated} bg="var(--status-signed-bg)" fg="var(--status-signed-fg)" />
        <CountPill label="Needs setup" value={needsSetup} bg="var(--status-awaiting-bg)" fg="var(--status-awaiting-fg)" />
        <CountPill label="Available" value={available} bg="var(--status-sent-bg)" fg="var(--status-sent-fg)" />
        <CountPill label="Not found" value={notFound} bg="var(--status-revoked-bg)" fg="var(--status-revoked-fg)" />
        <CountPill label="Not checked" value={notChecked} bg="var(--surface-ink-tint)" fg="var(--ink-secondary)" />
        <CountPill label="Not probeable" value={notProbeable} bg="var(--status-expired-bg)" fg="var(--status-expired-fg)" />
        <CountPill label="Reference" value={reference} bg="var(--status-draft-bg)" fg="var(--status-draft-fg)" />
        <CountPill label="Deprecated" value={deprecated} bg="var(--status-revoked-bg)" fg="var(--status-revoked-fg)" />
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>
        These eight add up to{" "}
        <strong style={{ color: "var(--ink-secondary)" }}>
          {(activated + needsSetup + available + notFound + notChecked + notProbeable + reference + deprecated).toLocaleString()}
        </strong>{" "}
        browsable items — the same number the status filter offers. Stated so the
        two can be checked against each other rather than taken on trust.
      </p>
    </section>
  );
}
