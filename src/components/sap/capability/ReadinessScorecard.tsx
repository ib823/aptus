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
import { HUB_CONTENT_TYPES } from "@/lib/sap-public/hub-content";

/**
 * WHAT A NON-ADMIN IS TOLD INSTEAD, and why this string exists at all.
 *
 * This line used to read "(not probed yet — run “Probe all”)" for EVERYONE.
 * But the Probe all button lives inside `{data?.isAdmin && …}` in
 * SapCapabilityCatalogue — a consultant never sees it. So the one sentence on
 * the screen that explained a readiness of zero instructed the reader to press
 * a control that was not on their page, and the natural conclusion is that the
 * product is broken rather than that the action is somebody else's.
 *
 * It is not a permission ERROR either: nothing was refused, because nothing was
 * attempted. It is a statement of whose action this is, which is the same thing
 * the CoreEdge console says about every control it will not give you.
 */
const PROBE_IS_ADMIN_ONLY = "(not probed yet — a platform admin runs “Probe all”)";

/** activated / probed as a 0–100 integer (0 when nothing was probed). */
export function readinessPercent(activated: number, probed: number): number {
  if (probed <= 0) return 0;
  return Math.round((activated / probed) * 100);
}

/**
 * ONE PILL: a label and the number it counts.
 *
 * `justify-between` ALONE IS NOT SPACING. It separates two children only while
 * there is slack between them; the moment label plus number fill the box, the
 * space it was providing is zero and they touch. In a nine-column row on a wide
 * screen each pill is ~140px, so the longest labels beside the largest numbers
 * rendered as "Available147" and "Reference2,527" while "Authorized 0" — which
 * still had slack — looked perfectly fine.
 *
 * That is the worst possible failure mode for this component: it degrades
 * exactly on the biggest numbers, on a scorecard whose entire argument is that
 * every number traces to a probe. `gap-2` is a floor rather than a remainder,
 * so the two can never collide at any width.
 *
 * `whitespace-nowrap` keeps two-word labels on one line — "Needs setup", "Not
 * checked" and "Not probeable" wrapped where the others did not, which made the
 * row of pills different heights — and `shrink-0` on the value means a squeeze
 * is taken out of the label, never out of the number.
 */
function CountPill({ label, value, bg, fg }: { label: string; value: number; bg: string; fg: string }) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-[var(--radius-pill)] px-3 py-1.5"
      style={{ background: bg, color: fg }}
    >
      <span className="truncate text-xs font-medium whitespace-nowrap">{label}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{value.toLocaleString()}</span>
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
  probeFailed = 0,
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
  canProbe = true,
}: {
  activated: number;
  dataConfirmed: number;
  dataProbe: boolean;
  needsSetup: number;
  /** A probe returned 404 — published, but the path is not on this tenant. */
  notFound: number;
  notChecked: number;
  /**
   * A probe RAN and could not reach a verdict (5xx / timeout / network).
   * Optional so existing callers keep compiling and read 0, which is honest:
   * a caller that does not yet supply it has no failed probes to report.
   */
  probeFailed?: number;
  /**
   * Whether the reader can actually run the probe this card tells them to run.
   *
   * DEFAULTS TO TRUE so every existing caller keeps its current sentence — the
   * SAP Operations explorer is the other one, and changing what it says was not
   * asked for. The Studio caller passes the SAME flag that decides whether the
   * button renders, so the instruction and the control cannot disagree.
   */
  canProbe?: boolean;
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
              : canProbe
                ? "(not probed yet — run “Probe all”)"
                : PROBE_IS_ADMIN_ONLY}
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

      {/*
        CATALOGUE SCALE — and what each number actually counts.

        "Items" is not rows and not tenant services. A grouped catalogue row (a
        BAdI bundle, a CDS line-of-business bundle, an integration package)
        stands for the member count SAP declares for it, so this total is item
        VOLUME across SAP's published content. Saying "items" alone invited three
        different readings of one number — how many records we hold, how many
        artefacts SAP publishes, and how many services this tenant serves — and
        only the middle one is true. The tenant question is the probe ratio
        above, which is why this line is never folded into it.
      */}
      <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>
        Catalogue scale (SAP&rsquo;s published content, not this tenant):{" "}
        <strong style={{ color: "var(--ink-secondary)" }}>{(totalItems ?? apiTotal).toLocaleString()}</strong> items across{" "}
        {HUB_CONTENT_TYPES.length} content types — grouped packages counted by the member count SAP declares, not by
        catalogue rows ·{" "}
        <strong style={{ color: "var(--ink-secondary)" }}>{probeable.toLocaleString()}</strong> services with an OData endpoint to
        probe (V2 + best-effort V4)
        {aiApis ? <> · <strong style={{ color: "var(--ink-secondary)" }}>{aiApis.toLocaleString()}</strong> AI APIs</> : null} · the
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
        false all over again. The vocabulary has NINE members (DEPRECATED joined in
        2608 WS3; PROBE_FAILED split out of NOT_CHECKED so a failed attempt stops
        reading as "nobody looked"); this row renders all nine, and the
        reconciliation sentence below is only ever computed over the same nine. On a screen whose whole argument is
        "nothing is inferred, every number traces to a probe", a silently
        missing bucket is the worst kind of error.
      */}
      {/*
        NOT NINE ACROSS. `lg:grid-cols-9` gave every pill ~140px on a 1900px
        screen, which is narrower than "Not probeable" plus a four-digit count
        needs — so labels wrapped and the row came out ragged. Five columns let
        each pill hold its label on one line, and the ninth wraps to a second
        row rather than squeezing the other eight.
      */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <CountPill label="Authorized" value={activated} bg="var(--status-signed-bg)" fg="var(--status-signed-fg)" />
        <CountPill label="Needs setup" value={needsSetup} bg="var(--status-awaiting-bg)" fg="var(--status-awaiting-fg)" />
        <CountPill label="Available" value={available} bg="var(--status-sent-bg)" fg="var(--status-sent-fg)" />
        <CountPill label="Not found" value={notFound} bg="var(--status-revoked-bg)" fg="var(--status-revoked-fg)" />
        <CountPill label="Not checked" value={notChecked} bg="var(--surface-ink-tint)" fg="var(--ink-secondary)" />
        <CountPill label="Probe failed" value={probeFailed} bg="var(--status-expired-bg)" fg="var(--status-expired-fg)" />
        <CountPill label="Not probeable" value={notProbeable} bg="var(--status-expired-bg)" fg="var(--status-expired-fg)" />
        <CountPill label="Reference" value={reference} bg="var(--status-draft-bg)" fg="var(--status-draft-fg)" />
        <CountPill label="Deprecated" value={deprecated} bg="var(--status-revoked-bg)" fg="var(--status-revoked-fg)" />
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>
        These nine add up to{" "}
        <strong style={{ color: "var(--ink-secondary)" }}>
          {(
            activated + needsSetup + available + notFound + notChecked + probeFailed + notProbeable + reference + deprecated
          ).toLocaleString()}
        </strong>{" "}
        browsable items — the same number the status filter offers. Stated so the
        two can be checked against each other rather than taken on trust.
      </p>
    </section>
  );
}
