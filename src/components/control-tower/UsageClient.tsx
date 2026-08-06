"use client";

/**
 * CoreEdge usage — the consumption record pricing will be chosen from.
 *
 * Reads rollups only (see the endpoint's provenance): the totals are sums of
 * stored organization-days, a missing day is an absence the strip explains,
 * and nothing here bills anyone.
 */

import {
  OpsCard,
  OpsHeading,
  OpsPlaceholder,
  OpsTable,
  ProvenanceStrip,
  Stat,
  opsMonoStyle,
} from "@/components/ops/OpsChrome";
import { count, FeedAsAt, sinceLabel, useOpsFeed } from "@/components/ops/useOpsFeed";
import { formatDate } from "@/lib/format/date";

interface UsageDay {
  organizationId: string;
  day: string;
  calls: number;
  rowsRead: number;
  writes: number;
  refusals: number;
  distinctInterfaces: number;
  distinctCredentials: number;
}

interface UsagePayload {
  scope: string;
  windowDays: number;
  totals: { calls: number; rowsRead: number; writes: number; refusals: number };
  days: UsageDay[];
  lastRollupRun: { finishedAt: string; ok: boolean } | null;
  provenance: { rollupsOnly: string; floorNotCensus: string; noBilling: string };
}

export function UsageClient() {
  const { feed, fetchedAt } = useOpsFeed<UsagePayload>("/api/control-tower/usage");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="CoreEdge usage"
        lede="Broker consumption per day, from the nightly rollups. This is the record pricing will be chosen from — no payment processor is wired, and nothing here bills anyone."
      />
      <FeedAsAt fetchedAt={fetchedAt} />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder kind="error" title="Usage could not be read" detail={feed.message} />
        </OpsCard>
      ) : (
        <UsageBody data={feed.data} />
      )}
    </div>
  );
}

function UsageBody({ data }: { data: UsagePayload }) {
  const { totals, days, provenance, windowDays } = data;

  return (
    <OpsCard>
      <div style={{ display: "flex", gap: 30, padding: "15px 16px", flexWrap: "wrap" }}>
        <Stat label="Calls" value={count(totals.calls)} basis={`last ${windowDays} days`} />
        <Stat label="Rows read" value={count(totals.rowsRead)} basis="successful reads only" />
        <Stat label="Writes" value={count(totals.writes)} basis="accepted writes only" />
        <Stat
          label="Refused"
          value={count(totals.refusals)}
          basis="401/403 — a product signal, not volume"
          tone={totals.refusals > 0 ? "attention" : "default"}
        />
      </div>

      {days.length === 0 ? (
        <OpsPlaceholder
          kind="empty"
          title="No usage rolled up yet"
          detail={
            data.lastRollupRun
              ? "The nightly rollup has run but found no broker traffic for this scope in the window."
              : "The nightly rollup has not recorded a run yet. Days appear here after it does — nothing is aggregated live."
          }
        />
      ) : (
        <OpsTable head={["Day", "Organization", "Calls", "Rows read", "Writes", "Refused", "Interfaces", "Credentials"]}>
          {days.map((d) => (
            <tr key={`${d.organizationId}:${d.day}`}>
              <td style={opsMonoStyle}>{formatDate(d.day)}</td>
              <td style={opsMonoStyle}>{d.organizationId}</td>
              <td style={opsMonoStyle}>{count(d.calls)}</td>
              <td style={opsMonoStyle}>{count(d.rowsRead)}</td>
              <td style={opsMonoStyle}>{count(d.writes)}</td>
              <td style={opsMonoStyle}>{count(d.refusals)}</td>
              <td style={opsMonoStyle}>{count(d.distinctInterfaces)}</td>
              <td style={opsMonoStyle}>{count(d.distinctCredentials)}</td>
            </tr>
          ))}
        </OpsTable>
      )}

      <ProvenanceStrip claim="Rollups only — a floor, not a census">
        {provenance.rollupsOnly}
        <div style={{ marginTop: 6 }}>{provenance.floorNotCensus}</div>
        <div style={{ marginTop: 6 }}>
          {provenance.noBilling}
          {data.lastRollupRun
            ? ` Last rollup ${data.lastRollupRun.ok ? "completed" : "FAILED"} ${sinceLabel(data.lastRollupRun.finishedAt)}.`
            : " No rollup run recorded yet."}
        </div>
      </ProvenanceStrip>
    </OpsCard>
  );
}
