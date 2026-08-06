"use client";

/**
 * The jobs strip — did the scheduled sweeps actually run?
 *
 * This is the one panel on the Operations home that is not a link to another
 * screen, and it earns the exception the home page's own comment reserves: a
 * genuine cross-screen fact with no authoritative screen of its own. Every
 * number here is a recorded CronRunLog row; a job that has never recorded a
 * run renders as an absence, never as a failure and never as a pass.
 */

import {
  AbsencePill,
  OpsCard,
  OpsChip,
  OpsPlaceholder,
  OpsTable,
  ProvenanceStrip,
  opsCellStyle,
  opsMonoStyle,
} from "@/components/ops/OpsChrome";
import { count, FeedAsAt, sinceLabel, useOpsFeed } from "@/components/ops/useOpsFeed";

interface JobRow {
  job: string;
  schedule: string;
  lastRun: {
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    ok: boolean;
    summary: unknown;
  } | null;
  recentFailures: number;
  runsRecorded: number;
}

interface JobsPayload {
  jobs: JobRow[];
  provenance: {
    deploymentWide: string;
    recordingStartsAtDeploy: string;
    historyPerJob: number;
  };
}

export function JobsStrip() {
  const { feed, fetchedAt } = useOpsFeed<JobsPayload>("/api/ops/jobs");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Scheduled jobs</div>
        <FeedAsAt fetchedAt={fetchedAt} />
      </div>

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder kind="error" title="The job log could not be read" detail={feed.message} />
        </OpsCard>
      ) : (
        <OpsCard>
          <OpsTable head={["Job", "Schedule", "Last run", "Outcome", "Recent failures"]}>
            {feed.data.jobs.map((j) => (
              <tr key={j.job}>
                <td style={opsMonoStyle}>{j.job}</td>
                <td style={opsCellStyle}>{j.schedule}</td>
                <td style={opsMonoStyle}>
                  {j.lastRun ? sinceLabel(j.lastRun.finishedAt) : "—"}
                </td>
                <td style={opsCellStyle}>
                  {j.lastRun === null ? (
                    <AbsencePill
                      label="never recorded"
                      meaning="no run has been recorded since the log was introduced — an absence, not a failure"
                    />
                  ) : j.lastRun.ok ? (
                    <OpsChip
                      tone="good"
                      label="ok"
                      meaning={`completed in ${count(j.lastRun.durationMs)} ms`}
                    />
                  ) : (
                    <OpsChip
                      tone="bad"
                      label="failed"
                      meaning="the last recorded run did not complete successfully"
                    />
                  )}
                </td>
                <td style={opsMonoStyle}>
                  {j.runsRecorded === 0
                    ? "—"
                    : `${count(j.recentFailures)} of last ${count(j.runsRecorded)}`}
                </td>
              </tr>
            ))}
          </OpsTable>
          <ProvenanceStrip claim="Deployment-wide, recorded from the release that introduced the log">
            {feed.data.provenance.deploymentWide}
            <div style={{ marginTop: 6 }}>{feed.data.provenance.recordingStartsAtDeploy}</div>
          </ProvenanceStrip>
        </OpsCard>
      )}
    </div>
  );
}
