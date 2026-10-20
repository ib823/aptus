/**
 * The scheduled connection probe sweep — health that reflects reality without
 * a human clicking Test.
 *
 * BEFORE THIS, `lastValidationStatus` was written by exactly one route: the
 * Studio connection test, consultant-gated, in a different workspace from the
 * screen that displays the chip. The `support` persona who owns Operations
 * could not cause a probe; a "healthy" chip could be months old; and the
 * `connection-unhealthy` MAJOR incident could only ever reflect the last time
 * a builder happened to click. This sweep probes every active connection with
 * a probe path (read-only $metadata, the same probeConnection the test uses),
 * writes the summary columns, appends a SapConnectionProbeEvent — the history
 * that makes drift a signal — and ALERTS on the healthy→failing transition.
 *
 * THE TRANSITION IS THE DEDUPE. An alert fires when a connection that last
 * probed healthy probes failing — not on every failing sweep, so a connection
 * that is down for a week alerts once, when it went down. Recovery is recorded
 * in the history but deliberately not alerted: an inbox trained to expect
 * "recovered" mail starts ignoring "failed" mail.
 */

import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/lib/db/prisma";
import { permitCrossTenantReads } from "@/lib/db/tenant-guard";
import { sendEmail } from "@/lib/email/brevo";
import { esc } from "@/lib/email/templates";
import { isDriftTransition } from "@/lib/ops/incidents";
import { probeConnection, resolveProbePath, type ConnectionHealthStatus } from "@/lib/studio/connection-health";
import {
  connectionRefusalMessage,
  resolveSapConnections,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";

const SWEEP_CONCURRENCY = 4;

export interface SweepResult {
  probed: number;
  skippedNoPath: number;
  unreadable: number;
  byStatus: Record<string, number>;
  transitions: { connectionId: string; from: string | null; to: string }[];
  alertsSent: number;
}

async function alertDrift(
  conn: { id: string; label: string; environment: string | null; organizationId: string },
  from: string | null,
  to: string,
  detail: string,
): Promise<boolean> {
  // Sentry first — free when SENTRY_DSN is unset (the config no-ops).
  try {
    Sentry.captureMessage(
      `SAP connection drift: "${conn.label}" ${from ?? "?"} → ${to}${conn.environment ? ` (${conn.environment})` : ""}`,
      "warning",
    );
  } catch {
    /* alerting must never fail the sweep */
  }

  // Email the organization's admins. Metadata only — the label the org chose,
  // never a host or credential. Every value is escaped: the label is typed by
  // a builder, and the detail can quote a SuccessFactors refusal, which can
  // echo what was typed into the connection.
  try {
    const admins = await prisma.user.findMany({
      where: { organizationId: conn.organizationId, role: "platform_admin", isActive: true },
      select: { email: true },
    });
    if (admins.length === 0) return false;
    await sendEmail({
      to: admins.map((a) => ({ email: a.email })),
      subject: `SAP connection "${conn.label}" started failing (${to})`,
      htmlContent:
        `<p>The scheduled probe found <strong>${esc(conn.label)}</strong>` +
        `${conn.environment ? ` (${esc(conn.environment)})` : ""} failing: <strong>${esc(to)}</strong>.</p>` +
        `<p>${esc(detail)}</p>` +
        `<p>Its previous probe was ${esc(from ?? "unrecorded")}. See Operations → Connections.</p>`,
    });
    return true;
  } catch (err) {
    console.error("[probe-sweep] drift alert failed", { connectionId: conn.id, err });
    return false;
  }
}

/** How many times a status write retries against a status that moved under it. */
const SWAP_ATTEMPTS = 3;

/**
 * Record a probe's status and return the status it REPLACED, which is the one
 * the drift transition must be judged against.
 *
 * THE SWEEP'S OWN SNAPSHOT IS NOT THAT STATUS. `lastValidationStatus` is read
 * when the sweep starts, possibly minutes before this write. Two sweeps that
 * overlap (a duplicate delivery, or a run that outlived its job lease) both
 * read OK, both probe ERROR, and both alerted: two emails for one break, the
 * duplicate the transition rule exists to prevent. So the write is a compare-
 * and-set on the status this sweep believes it replaces. It lands only if that
 * is still the stored status; a write that misses re-reads the status and
 * tries again against what it finds. Exactly one writer replaces OK with
 * ERROR, and any other sees ERROR → ERROR, which is not a transition.
 *
 * A manual "Probe now" is a writer too, under the same rule: the transition is
 * from the last RECORDED status, whoever recorded it.
 */
async function swapProbeStatus(
  id: string,
  organizationId: string,
  believed: string | null,
  next: ConnectionHealthStatus,
): Promise<string | null> {
  // lastValidatedAt moves ONLY on a real 200 — same rule as the Studio test
  // route. A failing probe must not touch the one record of when the
  // connection last actually worked.
  const data = {
    lastValidationStatus: next,
    ...(next === "OK" ? { lastValidatedAt: new Date() } : {}),
  };

  let expected = believed;
  for (let attempt = 0; attempt < SWAP_ATTEMPTS; attempt++) {
    const swapped = await prisma.sapConnection.updateMany({
      where: { id, organizationId, lastValidationStatus: expected },
      data,
    });
    if (swapped.count === 1) return expected;
    const current = await prisma.sapConnection.findFirst({
      where: { id, organizationId },
      select: { lastValidationStatus: true },
    });
    // Gone since the scan: the plain update below fails on it, as it always has.
    if (!current) break;
    expected = current.lastValidationStatus;
  }

  // Still moving after every attempt. Record the observation anyway and claim
  // no transition: an alert this sweep cannot attribute risks being the
  // duplicate, and the next sweep judges against whatever is stored by then.
  await prisma.sapConnection.update({ where: { id, organizationId }, data });
  return next;
}

export async function sweepConnectionProbes(): Promise<SweepResult> {
  // The sweep serves every tenant in one run — the fleet query below is
  // cross-tenant BY DESIGN, declared so the attached tenant-scope guard
  // permits it instead of being weakened for it.
  permitCrossTenantReads("connection-probe-sweep: fleet-wide scheduled probe");

  // Every active connection, grouped by (org, product) so secrets are opened
  // through the same resolver every other read path uses.
  const rows = await prisma.sapConnection.findMany({
    where: { isActive: true },
    select: { id: true, organizationId: true, product: true, key: true, label: true, environment: true, lastValidationStatus: true },
  });

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.organizationId}::${r.product}`;
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }

  const result: SweepResult = {
    probed: 0,
    skippedNoPath: 0,
    unreadable: 0,
    byStatus: {},
    transitions: [],
    alertsSent: 0,
  };

  for (const [groupKey, groupRows] of groups) {
    const [organizationId, product] = groupKey.split("::") as [string, string];
    let resolved: ResolvedSapConnection[];
    try {
      resolved = await resolveSapConnections(organizationId, product);
    } catch {
      // A row that cannot be resolved is the CONNECTION_UNREADABLE state the
      // binding surfaces; the sweep counts it and moves on rather than dying.
      result.unreadable += groupRows.length;
      continue;
    }
    const byKey = new Map(resolved.map((c) => [c.key, c]));

    // Bounded concurrency inside the group; groups run serially — the sweep is
    // a background job and politeness to tenants beats wall-clock.
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < groupRows.length) {
        const row = groupRows[cursor++];
        if (!row) continue;
        const conn = byKey.get(row.key);
        if (!conn) continue;
        if (!resolveProbePath(conn)) {
          result.skippedNoPath++;
          continue;
        }
        const probe = await probeConnection(conn);
        result.probed++;
        result.byStatus[probe.status] = (result.byStatus[probe.status] ?? 0) + 1;

        const previous = await swapProbeStatus(row.id, organizationId, row.lastValidationStatus, probe.status);
        await prisma.sapConnectionProbeEvent.create({
          data: {
            organizationId,
            connectionId: row.id,
            status: probe.status,
            httpStatus: probe.httpStatus,
            durationMs: probe.durationMs,
            source: "cron",
          },
        });

        if (isDriftTransition(previous, probe.status)) {
          result.transitions.push({ connectionId: row.id, from: previous, to: probe.status });
          const sent = await alertDrift(
            { id: row.id, label: row.label, environment: row.environment, organizationId },
            previous,
            probe.status,
            probe.detail,
          );
          if (sent) result.alertsSent++;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(SWEEP_CONCURRENCY, groupRows.length) }, worker));
  }

  return result;
}

/**
 * What "Probe now" can come back with. THREE OUTCOMES, NOT TWO.
 *
 * This returned `null` for both "no such active connection in this tenant"
 * and "the row exists but its secrets would not open", and the route rendered
 * both as NOT_FOUND. So the one state an operator most needs to be told about
 * — a connection sealed under a previous SAP_CONNECTION_ENCRYPTION_KEY, which
 * every northbound call is already refusing as CONNECTION_UNREADABLE — read
 * as "no active connection with that id" on the screen built to diagnose it.
 * Same defect class as the Studio test route's bare 500 (R5), one file over.
 *
 * `unreadable` carries the resolver's own sentence, and writes NO health
 * status or probe event: no probe ran, so there is no tenant fact to record.
 */
export type ProbeOneOutcome =
  | { outcome: "probed"; status: ConnectionHealthStatus; detail: string }
  | { outcome: "not-found" }
  | { outcome: "unreadable"; detail: string };

/** Probe ONE connection on demand (the Ops "Probe now" action). */
export async function probeOneConnection(
  organizationId: string,
  connectionId: string,
  source: "manual" | "test",
): Promise<ProbeOneOutcome> {
  const row = await prisma.sapConnection.findFirst({
    where: { id: connectionId, organizationId, isActive: true },
    select: { id: true, key: true, product: true, environment: true },
  });
  if (!row) return { outcome: "not-found" };
  let resolved: ResolvedSapConnection[];
  try {
    resolved = await resolveSapConnections(organizationId, row.product);
  } catch {
    // The resolver opens every row of the (organization, product) group and
    // fails closed on the set — the same refusal the binding path gives, with
    // the same sentence, so the operator is sent to the same fix.
    return { outcome: "unreadable", detail: connectionRefusalMessage("CONNECTION_UNREADABLE", row.environment ?? "") };
  }
  const conn = resolved.find((c) => c.key === row.key);
  if (!conn) {
    // The row is active in the database and absent from the resolver's view
    // of the same group: not a state the product produces, and not "not
    // found" either. Said as what it is rather than dressed as a 404.
    return {
      outcome: "unreadable",
      detail: `The stored connection "${row.key}" is active but could not be resolved with the rest of its product group. Re-save it in Studio, or deactivate it.`,
    };
  }

  const probe = await probeConnection(conn);
  await prisma.sapConnection.update({
    where: { id: row.id, organizationId },
    // Same rule as the sweep and the Studio test: the timestamp is "last
    // succeeded", and only a real 200 may move it.
    data: {
      lastValidationStatus: probe.status,
      ...(probe.status === "OK" ? { lastValidatedAt: new Date() } : {}),
    },
  });
  await prisma.sapConnectionProbeEvent.create({
    data: {
      organizationId,
      connectionId: row.id,
      status: probe.status,
      httpStatus: probe.httpStatus,
      durationMs: probe.durationMs,
      source,
    },
  });
  return { outcome: "probed", status: probe.status, detail: probe.detail };
}
