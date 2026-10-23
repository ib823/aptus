/**
 * Who caused a SapConnectionProbeEvent, and whether it counts as history.
 *
 * EVERY PROBE THAT REACHED SAP LEAVES A ROW (P0.2 review). A probe reads one
 * revision of a connection's settings and then waits on SAP. When the
 * connection is re-saved in that wait, its answer belongs to the PREVIOUS
 * settings, so it must not become the new settings' status, history or drift
 * baseline (the revision guard in connection-probe-sweep.ts). But a request
 * still went from CoreEdge to a client's SAP system, and when someone asks
 * why their estate saw traffic at 14:07 the answer has to exist. Before the
 * guard every probe wrote its event; with it, a superseded probe wrote none.
 *
 * So a superseded probe still writes its event, with the source marked
 * (`test:superseded`, `manual:superseded`, `cron:superseded`), and every
 * reader of probe HISTORY — the drift baseline and the connection-drift
 * incident — reads only `countedProbeEvents`. The column is free text, so this
 * needs no migration, and an unmarked row (every row written before this) is
 * history exactly as before.
 */

export type ProbeSource = "cron" | "manual" | "test";

const SUPERSEDED_SUFFIX = ":superseded";

/** The `source` to store: the cause, marked when the probe was superseded. */
export function probeEventSource(source: ProbeSource, superseded: boolean): string {
  return superseded ? `${source}${SUPERSEDED_SUFFIX}` : source;
}

/** Whether a stored event is a superseded probe's trace rather than history. */
export function isSupersededProbeSource(source: string): boolean {
  return source.endsWith(SUPERSEDED_SUFFIX);
}

/**
 * The `where` fragment every reader of probe history spreads in: events about
 * the settings they were recorded against, never a superseded probe's trace.
 */
export const countedProbeEvents = { source: { not: { endsWith: SUPERSEDED_SUFFIX } } } as const;
