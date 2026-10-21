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

import {
  CONNECTION_GROUP_UNREADABLE_STATUS,
  CONNECTION_NEEDS_ATTENTION,
  CONNECTION_NOT_PROBED_STATUSES,
  CONNECTION_UNREADABLE_STATUS,
} from "@/lib/coreedge/freshness";
import { noteConnectionProbe } from "@/lib/coreedge/journey";
import { prisma } from "@/lib/db/prisma";
import { permitCrossTenantReads } from "@/lib/db/tenant-guard";
import { sendEmail } from "@/lib/email/brevo";
import { esc } from "@/lib/email/templates";
import { isDriftTransition } from "@/lib/ops/incidents";
import { countedProbeEvents, probeEventSource, type ProbeSource } from "@/lib/ops/probe-event-source";
import { probeConnection, resolveProbePath, type ConnectionHealthStatus } from "@/lib/studio/connection-health";
import {
  clearUnreadableOnceGroupOpens,
  connectionRefusalMessage,
  resolveSapConnection,
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

/** A status write's outcome: what it replaced, or that the settings had moved on. */
type ProbeStatusWrite = { readonly recorded: true; readonly previous: string | null } | { readonly recorded: false };

/**
 * THE REVISION GUARD (P0.2 review). A probe reads one version of a
 * connection's settings and then waits on SAP. A re-save in the meantime
 * (`upsertSapConnection`) keeps the row's id, points it at another host or
 * secret, bumps `revision` and clears the probe status, so the new settings
 * read "never tested". Without this guard the probe of the OLD settings then
 * wrote OK — and a last-success time — onto the row holding the NEW ones,
 * which nobody had probed. Every probe-status write therefore names the
 * revision the probe read through, and a write that matches no row is
 * discarded, as `recordLaneCheck` discards a lane check.
 *
 * A connection built outside the table (a test fixture) carries no revision:
 * nothing proves what it read through, so nothing is recorded.
 */
function revisionGuard(revision: number | undefined): { revision: number } | null {
  return revision === undefined ? null : { revision };
}

/**
 * A FAILURE SAP REPORTED IS NOT TRADED FOR A STATEMENT ABOUT ANOTHER ROW
 * (P0.2 review round 6).
 *
 * GROUP_UNREADABLE says "this row's secret opens; a sibling's will not". It
 * replaced whatever the row held — including UNAUTHORIZED, TIMEOUT, NOT_FOUND
 * or ERROR that SAP itself had answered. When the sibling was then fixed, the
 * clear (connection-resolver.ts `clearUnreadableOnceGroupOpens`) had nothing
 * to put back but "never tested": the 401 SAP was still returning through
 * this row vanished from every screen, the row left the unhealthy-connection
 * count so the MAJOR incident closed, and the drift baseline later saw
 * UNAUTHORIZED → UNAUTHORIZED, so no alert fired either.
 *
 * Such a row already reads refused (needs attention), already counts toward
 * the incident, and its failure stays true whatever the sibling does. So
 * GROUP_UNREADABLE is written only over a status that claims no failure of
 * this row's own — never tested, OK, NO_PROBE_PATH, UNREADABLE — and the
 * clear can only ever put back "never tested" over something no worse.
 * UNREADABLE (this row's own secret will not open) still replaces anything:
 * it is about this row, and the sibling's hint names the row "marked
 * unreadable" as the one to fix.
 */
function keepsOverGroupUnreadable(status: string | null): boolean {
  return status !== null && CONNECTION_NEEDS_ATTENTION.includes(status);
}

/**
 * A superseded probe still leaves its trace (P0.2 review round 3). It reached
 * the client's SAP system with the previous settings, so a probe event says
 * so, marked superseded: the drift baseline and the incident history skip it
 * (probe-event-source.ts), and no status, success time or journey milestone
 * is written for settings it never saw.
 */
async function recordSupersededProbe(
  organizationId: string,
  connectionId: string,
  probe: { status: string; httpStatus: number | null; durationMs: number },
  source: ProbeSource,
): Promise<void> {
  await prisma.sapConnectionProbeEvent.create({
    data: {
      organizationId,
      connectionId,
      status: probe.status,
      httpStatus: probe.httpStatus,
      durationMs: probe.durationMs,
      source: probeEventSource(source, true),
    },
  });
}

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
 *
 * Every attempt also names the `revision` the probe read through (see
 * `revisionGuard`): once the row has been re-saved, nothing is recorded.
 */
async function swapProbeStatus(
  id: string,
  organizationId: string,
  believed: string | null,
  next: ConnectionHealthStatus | typeof CONNECTION_UNREADABLE_STATUS | typeof CONNECTION_GROUP_UNREADABLE_STATUS,
  revision: number | undefined,
): Promise<ProbeStatusWrite> {
  const guard = revisionGuard(revision);
  if (!guard) return { recorded: false };
  // lastValidatedAt moves ONLY on a real 200 — same rule as the Studio test
  // route. A failing probe must not touch the one record of when the
  // connection last actually worked.
  const data = {
    lastValidationStatus: next,
    ...(next === "OK" ? { lastValidatedAt: new Date() } : {}),
  };

  const groupMarker = next === CONNECTION_GROUP_UNREADABLE_STATUS;
  let expected = believed;
  for (let attempt = 0; attempt < SWAP_ATTEMPTS; attempt++) {
    if (groupMarker && keepsOverGroupUnreadable(expected)) return { recorded: false };
    const swapped = await prisma.sapConnection.updateMany({
      where: { id, organizationId, ...guard, lastValidationStatus: expected },
      data,
    });
    if (swapped.count === 1) return { recorded: true, previous: expected };
    const current = await prisma.sapConnection.findFirst({
      where: { id, organizationId },
      select: { lastValidationStatus: true, revision: true },
    });
    // Gone since the scan, or re-saved since the probe read it: nothing this
    // probe saw is true of the row now.
    if (!current || current.revision !== guard.revision) return { recorded: false };
    expected = current.lastValidationStatus;
  }

  // Still moving after every attempt. Record the observation anyway and claim
  // no transition: an alert this sweep cannot attribute risks being the
  // duplicate, and the next sweep judges against whatever is stored by then.
  const last = await prisma.sapConnection.updateMany({
    where: {
      id,
      organizationId,
      ...guard,
      // Never over a failure SAP reported (`keepsOverGroupUnreadable`).
      ...(groupMarker
        ? { OR: [{ lastValidationStatus: null }, { lastValidationStatus: { notIn: [...CONNECTION_NEEDS_ATTENTION] } }] }
        : {}),
    },
    data,
  });
  return last.count === 1 ? { recorded: true, previous: next } : { recorded: false };
}

/**
 * The status a drift transition is judged against (P0.2 review).
 *
 * Usually the status this write replaced. But two stored values are not the
 * outcome of any probe: null after a re-save cleared it (the new settings
 * were never tested), and UNREADABLE / GROUP_UNREADABLE (no request reached
 * SAP). Judging against those lost the one alert that matters most: an admin
 * rotates a PROD password in Studio, mistypes it, and every call fails 401 —
 * before P0.2 the re-save left "OK" standing and the next probe mailed the
 * admins; with the status cleared, null → UNAUTHORIZED was "first
 * observation" and nobody was told. So for those, the baseline is the last
 * probe that actually RAN for this connection, before this one started. A
 * connection that has never been probed still has none, and its first
 * failure is still not a drift.
 */
async function driftBaseline(
  previous: string | null,
  organizationId: string,
  connectionId: string,
  probeStartedAt: Date,
): Promise<string | null> {
  if (previous !== null && !CONNECTION_NOT_PROBED_STATUSES.includes(previous)) return previous;
  // A superseded probe's trace is about settings that were replaced before it
  // returned: never a baseline (probe-event-source.ts).
  const last = await prisma.sapConnectionProbeEvent.findFirst({
    where: { organizationId, connectionId, at: { lt: probeStartedAt }, ...countedProbeEvents },
    orderBy: { at: "desc" },
    select: { status: true },
  });
  return last?.status ?? previous;
}

/**
 * Record a group whose secrets will not all open — on the RIGHT rows.
 *
 * The broker fails closed on the whole (organization, product) set, so every
 * row of it is refused (A50) and none may keep its last "OK". But writing
 * UNREADABLE on every row told the operator to re-enter the secret of a row
 * that opens perfectly well — usually the PROD one — which fixed nothing and
 * dropped that row's lane evidence on the way (P0.2 review). So each row is
 * opened on its own: one that will not open reads UNREADABLE; a sibling that
 * does reads GROUP_UNREADABLE ("another connection for this product will not
 * open"). If every row opens on its own, the group's failure was not about a
 * secret (a transient read), nothing can be attributed, and nothing is
 * written: the next sweep looks again.
 */
async function recordUnreadableGroup(
  organizationId: string,
  product: string,
  rows: ReadonlyArray<GroupRow>,
): Promise<void> {
  const opened = await openEachRow(organizationId, product, rows);
  if (!opened.some((o) => o.opens === false)) return;
  let wrote = false;
  for (const { row, opens } of opened) {
    if (opens === null) continue;
    const write = await swapProbeStatus(
      row.id,
      organizationId,
      row.lastValidationStatus,
      opens ? CONNECTION_GROUP_UNREADABLE_STATUS : CONNECTION_UNREADABLE_STATUS,
      row.revision,
    );
    wrote ||= write.recorded;
  }
  if (wrote) await clearIfFixedMeanwhile(organizationId, product);
}

/**
 * A FIX THAT LANDED WHILE THE GROUP WAS BEING ATTRIBUTED (P0.2 review round 6).
 *
 * The rows are opened, then their statuses written. A re-save of the broken
 * row that commits in between bumps ITS revision, so its own write misses —
 * but a healthy sibling's revision is unchanged, so GROUP_UNREADABLE lands on
 * it. The re-save's clear had already run and found nothing marked, so the
 * sibling read refused, and raised the MAJOR incident, until the next nightly
 * probe while the broker served every call. So after writing, the writer asks
 * the broker's question once more: when the set opens now, the clear runs
 * here too. Whichever runs last — this, or the fix's own clear — sees both
 * the fix and the marks. Returns whether anything was cleared.
 */
async function clearIfFixedMeanwhile(organizationId: string, product: string): Promise<boolean> {
  return (await clearUnreadableOnceGroupOpens(organizationId, product)) > 0;
}

/**
 * A ROW LEFT, JOINED OR CHANGED THE SET: ITS STATUSES FOLLOW THE BROKER (P0.2
 * review round 7).
 *
 * Studio's save and its Deactivate / Activate toggles are the places a person
 * changes which secrets the broker must open for a product. Rounds 5 and 6
 * answered only one direction — the set opens again, so its "will not open"
 * statuses are cleared — and missed the other two:
 *
 *   - Activate on a row whose secret will not open makes the set unopenable:
 *     the broker and the lane board refused every call while the healthy
 *     siblings read OK, healthy, until the next nightly sweep;
 *   - a re-save writes "never tested" on the saved row, and kept
 *     GROUP_UNREADABLE only when the row held exactly that. A sibling that
 *     held UNAUTHORIZED (round 6 never writes GROUP_UNREADABLE over it) read
 *     "never tested" after its re-save while the broker still refused.
 *
 * So after such a change the broker's own question is asked once
 * (`resolveSapConnections`, the read the binding path fails closed on): when
 * the set opens, the marks are cleared (`clearUnreadableOnceGroupOpens`); when
 * it does not, the group is attributed exactly as the sweep attributes it
 * (`recordUnreadableGroup`): UNREADABLE on the row that will not open,
 * GROUP_UNREADABLE on each sibling that does, never over a failure SAP
 * reported. One writer, so the screens cannot disagree with the broker by
 * which door the change came through.
 *
 * BEST EFFORT, AFTER THE CHANGE HAS COMMITTED. The caller's change is already
 * in the table, and its audit row and its answer must say so: a database
 * fault here (a pool timeout) once made a committed deactivation answer 500
 * with no audit row, and a committed re-save answer "was not saved". So this
 * never throws; a failure is logged and the next probe, or the next change,
 * puts the statuses right.
 */
export async function settleConnectionGroup(organizationId: string, product: string): Promise<void> {
  try {
    let opens = true;
    try {
      await resolveSapConnections(organizationId, product);
    } catch {
      opens = false;
    }
    if (opens) {
      await clearUnreadableOnceGroupOpens(organizationId, product);
      return;
    }
    const rows = await prisma.sapConnection.findMany({
      where: { organizationId, product, isActive: true },
      select: { id: true, key: true, label: true, lastValidationStatus: true, revision: true },
      orderBy: { createdAt: "asc" },
    });
    await recordUnreadableGroup(organizationId, product, rows);
  } catch (err) {
    console.error("[probe-sweep] settling a connection group's statuses failed", { organizationId, product, err });
  }
}

interface GroupRow {
  id: string;
  key: string;
  label: string;
  lastValidationStatus: string | null;
  revision: number;
}

/**
 * Open each row of a group on its own (a named key opens only that row):
 * true when it opens, false when it will not, null when it is no longer
 * active — deactivated since it was listed, so no longer part of the set.
 */
async function openEachRow<R extends GroupRow>(
  organizationId: string,
  product: string,
  rows: ReadonlyArray<R>,
): Promise<{ row: R; opens: boolean | null }[]> {
  return Promise.all(
    rows.map(async (row) => {
      try {
        return { row, opens: (await resolveSapConnection(organizationId, product, row.key)) === null ? null : true };
      } catch {
        return { row, opens: false };
      }
    }),
  );
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
    select: {
      id: true,
      organizationId: true,
      product: true,
      key: true,
      label: true,
      environment: true,
      lastValidationStatus: true,
      revision: true,
    },
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
      /*
       * AND SAYS SO ON EVERY ROW OF THE GROUP (P0.2, A50). It used to write
       * nothing, so a connection's last "OK" stood forever while the broker
       * refused every call for the product (it fails closed on the whole
       * group, so every row is unusable, not just the bad one). Which row is
       * the one to fix is said too: see `recordUnreadableGroup`. No probe ran,
       * so no probe event is written and `lastValidatedAt` — the last time SAP
       * answered — is left alone; no alert is sent from here either (an open
       * decision, docs/runbooks/coreedge-lane-truth.md).
       */
      await recordUnreadableGroup(organizationId, product, groupRows);
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
        const probeStartedAt = new Date();
        const probe = await probeConnection(conn);
        result.probed++;
        result.byStatus[probe.status] = (result.byStatus[probe.status] ?? 0) + 1;

        const write = await swapProbeStatus(
          row.id,
          organizationId,
          row.lastValidationStatus,
          probe.status,
          conn.revision,
        );
        // Re-saved while this probe ran: it probed the previous settings, so
        // it is not their health, not their history and not a drift of
        // theirs; the next probe asks the new settings. The request still
        // reached SAP, so its trace is kept, marked superseded.
        if (!write.recorded) {
          await recordSupersededProbe(organizationId, row.id, probe, "cron");
          continue;
        }
        const previous = await driftBaseline(write.previous, organizationId, row.id, probeStartedAt);
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
        // First good probe ends SAP set-up wait (P2.12). Guarded per process,
        // so a healthy connection costs one no-op insert per instance, ever.
        await noteConnectionProbe({
          organizationId,
          connectionId: row.id,
          environment: row.environment,
          status: probe.status,
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
 * What "Probe now" can come back with. EACH OUTCOME AS ITSELF.
 *
 * This returned `null` for both "no such active connection in this tenant"
 * and "the row exists but its secrets would not open", and the route rendered
 * both as NOT_FOUND. So the one state an operator most needs to be told about
 * — a connection sealed under a previous SAP_CONNECTION_ENCRYPTION_KEY, which
 * every northbound call is already refusing as CONNECTION_UNREADABLE — read
 * as "no active connection with that id" on the screen built to diagnose it.
 * Same defect class as the Studio test route's bare 500 (R5), one file over.
 *
 * `unreadable` carries the resolver's own sentence. It writes no probe event —
 * no probe ran, so there is no tenant fact to record — but since P0.2 (A50) it
 * records UNREADABLE as the row's status, so the last "OK" stops standing for
 * a connection every call is refused on — or GROUP_UNREADABLE, with the
 * sibling to fix named, when this row's own secret opens (P0.2 review).
 *
 * `superseded` (P0.2 review): the connection was re-saved while the probe ran,
 * so the result was about the previous settings and is not recorded as their
 * status or history — only as a probe event marked superseded, the trace that
 * a request reached SAP (round 3).
 */
export type ProbeOneOutcome =
  | { outcome: "probed"; status: ConnectionHealthStatus; detail: string }
  | { outcome: "not-found" }
  | {
      outcome: "unreadable";
      detail: string;
      /**
       * The status this call wrote on the row, when it wrote one (P0.2 review
       * round 5): a caller that answers for a person — the Studio test —
       * audits the change under that person. Absent when nothing was written
       * (every row opened on its own, or the row was re-saved meanwhile).
       */
      recorded?: typeof CONNECTION_UNREADABLE_STATUS | typeof CONNECTION_GROUP_UNREADABLE_STATUS;
    }
  | { outcome: "superseded"; detail: string };

/**
 * "Probe now" on a connection whose product group will not open.
 *
 * The resolver opens every row of the (organization, product) group and fails
 * closed on the set — the same refusal the binding path gives. Recorded on the
 * row as the sweep records it (P0.2, A50), so its last "OK" no longer stands;
 * no probe ran, so no probe event and `lastValidatedAt` untouched. Only THIS
 * row is written — it is the one asked about — and, like the sweep, it reads
 * UNREADABLE only when its own secret is the one that will not open. When it
 * opens, the operator is told which sibling to fix instead of being sent to
 * re-enter a secret that is fine (P0.2 review).
 *
 * Exported for the Studio "Test connectivity" route (P0.2 review round 4):
 * it opened only the named row, so on a group the broker refuses it wrote a
 * fresh OK over GROUP_UNREADABLE. Every writer of a connection's status now
 * judges the group the same way, through this one function.
 */
export async function recordUnreadableOne(
  organizationId: string,
  target: { id: string; product: string; environment: string | null },
): Promise<ProbeOneOutcome> {
  const groupRows = await prisma.sapConnection.findMany({
    where: { organizationId, product: target.product, isActive: true },
    select: { id: true, key: true, label: true, lastValidationStatus: true, revision: true },
    orderBy: { createdAt: "asc" },
  });
  const opened = await openEachRow(organizationId, target.product, groupRows);
  const self = opened.find((o) => o.row.id === target.id);
  if (!self || self.opens === null) return { outcome: "not-found" };
  const unopenable = opened.filter((o) => o.opens === false).map((o) => o.row.label);
  const ownSentence = connectionRefusalMessage("CONNECTION_UNREADABLE", target.environment ?? "");
  // Every row opens on its own: the group's failure was not a secret, and
  // nothing can be attributed. Said, not recorded; the next probe looks again.
  if (unopenable.length === 0) return { outcome: "unreadable", detail: ownSentence };

  const status = self.opens ? CONNECTION_GROUP_UNREADABLE_STATUS : CONNECTION_UNREADABLE_STATUS;
  const write = await swapProbeStatus(self.row.id, organizationId, self.row.lastValidationStatus, status, self.row.revision);
  // A fix that landed meanwhile clears what this just wrote (round 6); a
  // status that did not stand is not reported, or audited, as recorded.
  const stands = write.recorded && !(await clearIfFixedMeanwhile(organizationId, target.product));
  const recorded: Pick<Extract<ProbeOneOutcome, { outcome: "unreadable" }>, "recorded"> = stands
    ? { recorded: status }
    : {};
  if (!self.opens) return { outcome: "unreadable", detail: ownSentence, ...recorded };
  return {
    outcome: "unreadable",
    ...recorded,
    detail:
      `This connection's own secret opens, but another active connection for this product will not ` +
      `(${unopenable.map((l) => `"${l}"`).join(", ")}), so CoreEdge refuses every call for the product. ` +
      `Re-save that connection's secrets in Studio, or deactivate it.`,
  };
}

/** Probe ONE connection on demand (the Ops "Probe now" action). */
export async function probeOneConnection(
  organizationId: string,
  connectionId: string,
  source: Exclude<ProbeSource, "cron">,
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
    return recordUnreadableOne(organizationId, row);
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
  // Guarded by the revision the probe read through (`revisionGuard`).
  const guard = revisionGuard(conn.revision);
  const written = guard
    ? await prisma.sapConnection.updateMany({
        where: { id: row.id, organizationId, ...guard },
        // Same rule as the sweep and the Studio test: the timestamp is "last
        // succeeded", and only a real 200 may move it.
        data: {
          lastValidationStatus: probe.status,
          ...(probe.status === "OK" ? { lastValidatedAt: new Date() } : {}),
        },
      })
    : { count: 0 };
  if (written.count === 0) {
    // Re-saved while the probe ran: the answer is the previous settings',
    // so it is not recorded as the new settings' health or history. The
    // request still reached SAP, so its trace is kept, marked superseded.
    await recordSupersededProbe(organizationId, row.id, probe, source);
    return {
      outcome: "superseded",
      detail:
        "The connection was changed while it was being probed, so the result was about its previous settings and was not recorded as its health. Probe again.",
    };
  }
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
  await noteConnectionProbe({
    organizationId,
    connectionId: row.id,
    environment: row.environment,
    status: probe.status,
  });
  return { outcome: "probed", status: probe.status, detail: probe.detail };
}
