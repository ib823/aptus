"use client";

/**
 * Test Console + Scaffold.
 *
 * RUNS THROUGH THE BROKER. Every run goes to /api/studio/test/broker-run, which
 * exercises the SAME pipeline the deployed application's call takes: the grant
 * gate, the environment + SAP-client connection binding, the same read function
 * against the BOUND connection, and a northbound audit row marked dryRun. A
 * green result here is evidence the runtime call will succeed; a refusal here
 * is the exact refusal the application would receive, and the card says so.
 * (The console used to call the env-tenant /entities and /preview routes — no
 * grant check, no binding, no audit — so a green console proved nothing and
 * could read a DIFFERENT system than the one the app would reach.)
 *
 * THE LAZY-READ RULE: nothing touches SAP until you press Run. Selecting an
 * interface, switching tabs, or opening this page fires no live call.
 *
 * Honest status is not re-implemented here. A 200 with zero rows renders as
 * "No records" — a successful read of something empty — and is visibly different
 * from 403 "not set up" and from a 5xx failure. Those three are different facts
 * and the console never blurs them. A GOVERNANCE refusal renders no status chip
 * at all: the chip vocabulary describes the tenant's capability, and a refusal
 * that never reached the tenant has no tenant fact to report.
 *
 * Scaffold produces DOWNLOADS. There is no in-browser editor: the solution's code
 * lives in the developer's own repository.
 *
 * THE QUERY THE APP WOULD SEND (P1.4). With query parameters, Run is a
 * query-surface read of the first page, through the same broker: a refusal
 * carries the same `error.query` rule the app would get, and the result shows
 * what was sent to SAP as the service path and options (never the host).
 * Capture schema and Capture fixture are not offered for it: a query's rows
 * are shaped by its select and filters, so they describe the query, not the
 * contract or the mock. The builder fills the raw query from the interface's
 * policy, read from Postgres when it is opened, never on render.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { StudioStatusChip } from "@/components/studio/StudioStatusChip";
import { formatDate } from "@/lib/format/date";
import { type HonestStatus } from "@/lib/studio/honest-status";
import { refusalMessage } from "@/lib/studio/refusal-message";

/** A saved run, as the test-cases API returns it. */
interface SavedCase {
  id: string;
  name: string;
  interfaceId: string;
  /**
   * What was run. `environment` is the credential the run used: a solution now
   * holds one per environment (AD-11), so without it a replay cannot know which
   * system the recorded outcome came from. Cases saved before this field
   * existed have none, and the replay says so rather than guessing.
   */
  request: { entity?: string; limit?: number; environment?: string; query?: string } | null;
  lastOutcome: "PASS" | "FAIL" | "NOT_RUN";
  httpStatus: number | null;
  lastRunAt: string | null;
}

/**
 * Which connection a run of this interface WILL bind to, computed on the
 * server from the credential and connection rows with the broker's own
 * selection function — before Run, without a SAP call. The top-bar tenant
 * picker does not decide this and the console says so.
 */
export type BindingPreview =
  | { kind: "no-credential" }
  | {
      kind: "bound";
      credential: { label: string; environment: string; sapClient: string | null };
      connection: { label: string; environment: string | null; sapClient: string | null };
      bindingUnverified: boolean;
    }
  | {
      kind: "refused";
      credential: { label: string; environment: string; sapClient: string | null };
      reason: string;
      message: string;
    };

/** One live credential of the interface's solution, and where a run as it would go. */
export interface CredentialOption {
  clientId: string;
  binding: Exclude<BindingPreview, { kind: "no-credential" }>;
}

export interface TestableInterface {
  id: string;
  name: string;
  externalId: string;
  sapProduct: string;
  entitySet: string | null;
  operation: string;
  solutionName: string;
  /**
   * The solution's live credentials, one per environment (AD-11). Empty means
   * the run will be refused before it reaches a tenant. With several, the
   * developer picks which to run as — each binds to a different system.
   */
  credentials: readonly CredentialOption[];
}

interface RunState {
  phase: "idle" | "running" | "done";
  /**
   * Absent when no read reached the tenant — including every governance
   * refusal. The chip is rendered only when this is set, because the
   * vocabulary describes the tenant's capability and nothing else may borrow it.
   */
  status?: HonestStatus | undefined;
  detail?: string;
  rows?: Record<string, unknown>[];
  entitySets?: string[];
  httpStatus?: number | undefined;
  /** A governance refusal — the same one the deployed app would receive, with a query refusal's `error.query`. */
  refusal?: { kind: string; message: string; query?: QueryRefusalDetail | undefined } | undefined;
  /** Which connection the binding chose — the fact the old console lacked. */
  boundTo?:
    | {
        label: string;
        environment: string | null;
        sapClient: string | null;
        bindingUnverified: boolean;
      }
    | undefined;
  /** The interface is still DRAFT; served, and said. */
  draft?: boolean;
  /**
   * The broker's own outcome for the run. Capture fixture sends it, so the
   * fixture's scenario, status and code are the broker's (P0.4, A57).
   */
  readStatus?: BrokerReadStatus | undefined;
  /**
   * The contract the run was against. Both captures send it back, and the
   * route refuses one from a run of an earlier contract (P0.4, A38).
   */
  contract?: { version: number; entitySet: string | null } | undefined;
  /** A query run's own outcome and what it sent (P1.4); absent on a ?limit run. */
  query?: QueryRunInfo | undefined;
  /** The chip's own words, when a query outcome says more than the status (a record SAP does not have). */
  statusLabel?: string | undefined;
  statusMeaning?: string | undefined;
  /**
   * What this run sent: the query (trimmed; null for a ?limit run), the
   * entity and the limit. A saved case records these, never the fields as
   * they are when Save is clicked, so a refused query is saved as that query
   * and an edit after the run cannot be stored beside an outcome it never had.
   */
  sent?: { readonly query: string | null; readonly entity: string; readonly limit: number } | undefined;
}

type BrokerReadStatus = "OK" | "EMPTY" | "NEEDS_SETUP" | "NOT_FOUND" | "TIMEOUT" | "ERROR";

/** A query run's outcome (odata/query-status.ts QueryReadStatus). */
type QueryReadStatus = BrokerReadStatus | "NO_RECORD" | "SAP_REJECTED" | "TOO_LARGE";

/** `error.query` on a refusal: the rule, and what is safe to repeat. */
interface QueryRefusalDetail {
  rule: string;
  parameter?: string;
  field?: string;
  allowed?: string[];
}

interface QueryRunInfo {
  status: QueryReadStatus;
  kind: string;
  /** The service path, entity set and options sent: never the host. */
  sent: string;
  rule: string | null;
  page: { index: number; size: number; rowsServed: number; complete: boolean; stopped: string | null } | null;
  totalCount?: number | null;
}

/**
 * A query run's outcome as a chip. A record SAP does not have is an answer
 * from a working service, said as such; SAP refusing the query, or a page
 * too large to read, is a failed attempt the caller can change.
 */
function queryChip(status: QueryReadStatus): { status: HonestStatus; label?: string; meaning?: string } {
  switch (status) {
    case "OK":
    case "EMPTY":
      return { status: "ACTIVATED" };
    case "NO_RECORD":
      return { status: "ACTIVATED", label: "No record", meaning: "the service answered: no record has this key" };
    case "NEEDS_SETUP":
      return { status: "NEEDS_SETUP" };
    case "NOT_FOUND":
      return { status: "NOT_FOUND" };
    case "SAP_REJECTED":
      return { status: "PROBE_FAILED", label: "Query refused by SAP", meaning: "the service refused this query; change the query" };
    case "TOO_LARGE":
      return { status: "PROBE_FAILED", label: "Too large", meaning: "the answer is larger than CoreEdge reads or returns" };
    default:
      return { status: "PROBE_FAILED" };
  }
}

/** The interface's query policy, as the builder needs it (api/studio/interfaces/[id]/query-policy). */
interface BuilderPolicy {
  flagEnabled: boolean;
  compiled: {
    state: string;
    key: string[] | null;
    fields: { n: string; ops: string[]; sort: boolean }[];
  } | null;
}

const OP_LABEL: Record<string, string> = { eq: "equals", in: "any of", gt: "greater than", ge: "at least", lt: "less than", le: "at most" };

/** The contract a run was against, as the capture routes take it — or nothing, for an older broker. */
function contractOf(run: RunState): { interfaceVersion?: number; entitySet?: string | null } {
  return run.contract ? { interfaceVersion: run.contract.version, entitySet: run.contract.entitySet } : {};
}

export function TestConsoleClient({
  interfaces,
  tenantKey,
  canSave,
}: {
  interfaces: readonly TestableInterface[];
  tenantKey: string | null;
  canSave: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(interfaces[0]?.id ?? null);
  const [entity, setEntity] = useState("");
  const [limit, setLimit] = useState(10);
  /** The query the deployed app would send (P1.4); empty runs the ?limit read. */
  const [queryText, setQueryText] = useState("");
  const [run, setRunState] = useState<RunState>({ phase: "idle" });
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [files, setFiles] = useState<{ path: string; contents: string }[] | null>(null);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);

  const selected = interfaces.find((i) => i.id === selectedId) ?? null;

  /*
   * WHICH CREDENTIAL TO RUN AS. Chosen per interface (its solution's rows);
   * defaults to the first, and the picker only appears when there is a
   * choice. Sent to the broker as clientId so the run is the one previewed.
   */
  const [chosenClientId, setChosenClientId] = useState<string | null>(null);
  const credential =
    selected?.credentials.find((c) => c.clientId === chosenClientId) ?? selected?.credentials[0] ?? null;

  /*
   * SAVED CASES, FINALLY READABLE. "Save as test case" confirmed "Saved" and no
   * screen in the product ever listed, replayed or deleted one — a write-only
   * record, the same dead-end shape the registration flow was cured of. This is
   * a DB read, not a tenant read, so loading it on mount does not violate the
   * lazy-read rule; replay goes through the same broker dry-run as Run.
   */
  const [cases, setCases] = useState<SavedCase[]>([]);
  const [caseBusy, setCaseBusy] = useState<string | null>(null);
  const [caseResult, setCaseResult] = useState<Record<string, string>>({});

  const loadCases = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/test-cases");
      const json = (await res.json()) as { data?: { cases?: SavedCase[]; testCases?: SavedCase[] } };
      setCases(json.data?.cases ?? json.data?.testCases ?? []);
    } catch {
      /* the panel simply stays empty; saving still works */
    }
  }, []);
  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  /**
   * WHICH credential a replay runs as.
   *
   * Replay sent no clientId at all, so a solution holding credentials for more
   * than one environment — the normal shape since AD-11 — had every replay
   * refused as AMBIGUOUS_CREDENTIAL, and a saved case became unreplayable the
   * moment a second environment was issued one. The case records the
   * environment it ran against; the replay resolves that environment's live
   * credential, and refuses locally rather than silently running against a
   * different system.
   */
  const replayCredential = useCallback(
    (c: SavedCase): { ok: true; clientId?: string } | { ok: false; message: string } => {
      const creds = interfaces.find((i) => i.id === c.interfaceId)?.credentials ?? [];
      const env = c.request?.environment;
      if (env) {
        const match = creds.find((x) => x.binding.credential.environment === env);
        return match
          ? { ok: true, clientId: match.clientId }
          : {
              ok: false,
              message: `no live ${env} credential — this case was recorded against ${env}, and replaying as another environment would test a different system`,
            };
      }
      // Recorded before the environment was stored. One credential is
      // unambiguous; several are not, and the broker says so in its own words.
      return creds.length === 1 ? { ok: true, clientId: creds[0]!.clientId } : { ok: true };
    },
    [interfaces],
  );

  const replayCase = useCallback(
    async (c: SavedCase) => {
      const cred = replayCredential(c);
      if (!cred.ok) {
        setCaseResult((m) => ({ ...m, [c.id]: `refused — ${cred.message}` }));
        return;
      }
      setCaseBusy(c.id);
      try {
        const res = await fetch("/api/studio/test/broker-run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interfaceId: c.interfaceId,
            ...(cred.clientId ? { clientId: cred.clientId } : {}),
            ...(c.request?.entity ? { entity: c.request.entity } : {}),
            limit: Math.min(c.request?.limit ?? 10, 50),
            ...(c.request?.query ? { query: c.request.query } : {}),
          }),
        });
        const json = (await res.json()) as {
          data?: { outcome: string; status?: string; queryStatus?: string; httpStatus?: number; refusal?: { message: string } };
          error?: { message?: string };
        };
        const d = json.data;
        setCaseResult((m) => ({
          ...m,
          [c.id]: !res.ok || !d
            ? json.error?.message ?? "replay failed"
            : d.outcome === "refused"
              ? `refused — ${d.refusal?.message ?? ""}`
              : `${d.status ?? d.queryStatus} · HTTP ${d.httpStatus}`,
        }));
      } catch {
        setCaseResult((m) => ({ ...m, [c.id]: "replay failed" }));
      } finally {
        setCaseBusy(null);
      }
    },
    [replayCredential],
  );

  const deleteCase = useCallback(
    async (id: string) => {
      setCaseBusy(id);
      try {
        const res = await fetch("/api/studio/test-cases", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (res.ok) setCases((cs) => cs.filter((c) => c.id !== id));
      } finally {
        setCaseBusy(null);
      }
    },
    [],
  );

  /*
   * Entity sets this tenant actually exposed on the last run, unioned with the
   * one the Interfaces record declares. Read from `run` so the dropdown gets
   * richer after a probe without another request.
   */
  const knownEntitySets = useMemo(() => {
    const names = new Set<string>();
    if (selected?.entitySet) names.add(selected.entitySet);
    for (const n of run?.entitySets ?? []) names.add(n);
    return [...names].sort();
  }, [selected?.entitySet, run?.entitySets]);


  /** The only place a live SAP read is triggered — through the broker pipeline. */
  const doRun = useCallback(async () => {
    if (!selected) return;
    const sent = { query: queryText.trim() || null, entity, limit };
    // Every outcome of this run carries what it sent, for Save as test case.
    const setRun = (state: RunState) => setRunState(state.phase === "done" ? { ...state, sent } : state);
    setRun({ phase: "running" });
    setSaved(null);
    try {
      const res = await fetch("/api/studio/test/broker-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interfaceId: selected.id,
          ...(credential ? { clientId: credential.clientId } : {}),
          ...(sent.entity ? { entity: sent.entity } : {}),
          limit: Math.min(sent.limit, 50),
          ...(sent.query ? { query: sent.query } : {}),
        }),
      });
      const json = (await res.json()) as {
        data?:
          | { outcome: "refused"; refusal: { kind: string; message: string; query?: QueryRefusalDetail } }
          | {
              outcome: "ran";
              /** A ?limit run's outcome; absent on a query run. */
              status?: BrokerReadStatus;
              /** A query run's outcome (P1.4). */
              queryStatus?: QueryReadStatus;
              query?: Omit<QueryRunInfo, "status" | "totalCount">;
              totalCount?: number | null;
              httpStatus: number;
              contract?: { version: number; entitySet: string | null };
              records: Record<string, unknown>[];
              note: string;
              draft: boolean;
              boundTo: {
                label: string;
                environment: string | null;
                sapClient: string | null;
                bindingUnverified: boolean;
              };
            };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        setRun({
          phase: "done",
          detail: json.error?.message ?? `The run could not be started (HTTP ${res.status}).`,
        });
        return;
      }
      if (json.data.outcome === "refused") {
        // A governance refusal, verbatim. No status chip: nothing reached the
        // tenant, so there is no tenant fact to report — the refusal IS the
        // result, and it is the same one the deployed application would get.
        setRun({ phase: "done", refusal: json.data.refusal, detail: json.data.refusal.message });
        return;
      }
      const d = json.data;
      if (d.queryStatus !== undefined && d.query) {
        // A query run: its own outcome, and no readStatus, so no capture.
        const chip = queryChip(d.queryStatus);
        setRun({
          phase: "done",
          status: chip.status,
          statusLabel: chip.label,
          statusMeaning: chip.meaning,
          rows: d.records,
          httpStatus: d.httpStatus,
          detail: d.note,
          draft: d.draft,
          boundTo: d.boundTo,
          contract: d.contract,
          query: { ...d.query, status: d.queryStatus, ...(d.totalCount === undefined ? {} : { totalCount: d.totalCount }) },
        });
        return;
      }
      // The broker's read statuses ARE tenant facts, mapped to the shared
      // honest-status vocabulary the chip owns.
      const status: HonestStatus =
        d.status === "OK" || d.status === "EMPTY"
          ? "ACTIVATED"
          : d.status === "NEEDS_SETUP"
            ? "NEEDS_SETUP"
            : d.status === "NOT_FOUND"
              ? "NOT_FOUND"
              : // What remains is TIMEOUT | ERROR — the attempt ran and failed.
                // It used to fall through to NOT_PROBEABLE, which is terminal and
                // means there is no endpoint here to check: the opposite advice to
                // the one a timed-out read deserves. The broker never reports
                // NOT_PROBEABLE on this path, so there is no case to preserve.
                "PROBE_FAILED";
      setRun({
        phase: "done",
        status,
        rows: d.records,
        httpStatus: d.httpStatus,
        detail: d.note,
        draft: d.draft,
        boundTo: d.boundTo,
        readStatus: d.status,
        contract: d.contract,
      });
    } catch {
      setRun({ phase: "done", detail: "The run could not be completed." });
    }
  }, [selected, credential, entity, limit, queryText]);

  const saveCase = useCallback(async () => {
    if (!selected || run.phase !== "done" || !run.sent) return;
    const sent = run.sent;
    setSaving(true);
    try {
      const res = await fetch("/api/studio/test-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interfaceId: selected.id,
          name: sent.query
            ? `${selected.name} — ${sent.query.slice(0, 80)}`
            : `${selected.name} — ${sent.entity || selected.entitySet || "default"} (${sent.limit})`,
          request: {
            entity: sent.entity || selected.entitySet,
            limit: sent.limit,
            tenant: tenantKey,
            // A query run replays as the same query, refused or ran.
            ...(sent.query ? { query: sent.query } : {}),
            // WHICH system this outcome came from. A replay that ran as a
            // different environment's credential would be comparing a result
            // against a tenant that never produced it.
            ...(credential ? { environment: credential.binding.credential.environment } : {}),
          },
          // The outcome is what actually happened, never inferred — and the
          // status it happened against travels with it, so a stored PASS can be
          // checked rather than trusted.
          lastOutcome: run.status === "ACTIVATED" ? "PASS" : "FAIL",
          ...(run.httpStatus === undefined ? {} : { httpStatus: run.httpStatus }),
        }),
      });
      const json = (await res.json()) as { data?: { name: string }; error?: { message?: string } };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? "Could not save.");
      setSaved(json.data.name);
      void loadCases();
    } catch (err) {
      setSaved(err instanceof Error ? `Failed: ${err.message}` : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [selected, credential, run, tenantKey, loadCases]);

  /**
   * Turn the rows we just saw into a described contract.
   *
   * Sends the sample so the server can infer a SHAPE; the rows themselves are
   * not stored. Costs no extra SAP call — the read already happened.
   */
  const captureSchema = useCallback(async () => {
    if (!selected || !run.rows || run.rows.length === 0) return;
    setCapturing(true);
    try {
      const res = await fetch(`/api/studio/interfaces/${selected.id}/capture-schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: run.rows.slice(0, 100), ...contractOf(run) }),
      });
      const json = (await res.json()) as {
        data?: { fields: number; required: number; sampleSize: number };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) throw new Error(refusalMessage(res, json, "Could not capture the schema."));
      setSaved(
        `Captured ${json.data.fields} field${json.data.fields === 1 ? "" : "s"} ` +
          `(${json.data.required} always present) from ${json.data.sampleSize} rows. ` +
          "Regenerate the scaffold for a precise contract.",
      );
    } catch (err) {
      setSaved(err instanceof Error ? `Failed: ${err.message}` : "Failed to capture the schema.");
    } finally {
      setCapturing(false);
    }
  }, [selected, run]);

  /**
   * Record this outcome so it can be replayed offline.
   *
   * Works for failures too: "not set up" and "upstream failed" are the states
   * that actually break integrations, so they are the ones worth being able to
   * test against.
   */
  const captureFixture = useCallback(async () => {
    if (!selected || run.phase !== "done" || !run.status) return;
    setCapturing(true);
    try {
      const res = await fetch(`/api/studio/interfaces/${selected.id}/capture-fixture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The tenant's status travels with the capture. Without it a fixture
        // cannot say where it came from, and a genuine empty read is
        // indistinguishable from one recorded while this console was wrong.
        body: JSON.stringify({
          // The broker's outcome decides the scenario; the honest status stays
          // for a route from before readStatus existed.
          ...(run.readStatus ? { readStatus: run.readStatus } : {}),
          honestStatus: run.status,
          sourceStatus: run.httpStatus,
          ...(run.detail ? { detail: run.detail } : {}),
          rows: run.rows ?? [],
          ...contractOf(run),
        }),
      });
      const json = (await res.json()) as {
        data?: { scenario: string; rows: number; replaced: boolean };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) throw new Error(refusalMessage(res, json, "Could not capture the fixture."));
      setSaved(
        `${json.data.replaced ? "Replaced" : "Captured"} the "${json.data.scenario}" fixture` +
          `${json.data.rows > 0 ? ` (${json.data.rows} rows)` : ""}. ` +
          "Regenerate the scaffold to ship it with the offline mock.",
      );
    } catch (err) {
      setSaved(err instanceof Error ? `Failed: ${err.message}` : "Failed to capture the fixture.");
    } finally {
      setCapturing(false);
    }
  }, [selected, run]);

  /*
   * A refused kit is said, not dropped: the route refuses by design (the
   * organisation's compile time spent, the compiler busy or off, a kit past
   * its budget), and only `data` used to be read, so the panel stayed empty.
   */
  const loadScaffold = useCallback(async () => {
    if (!selected) return;
    setFiles(null);
    setScaffoldError(null);
    try {
      const res = await fetch(`/api/studio/interfaces/${selected.id}/scaffold`);
      const json = (await res.json().catch(() => null)) as { data?: { files: { path: string; contents: string }[] } } | null;
      if (res.ok && json?.data) setFiles(json.data.files);
      else setScaffoldError(`Failed: ${refusalMessage(res, json, "The starter kit could not be generated.")}`);
    } catch {
      setScaffoldError("Failed: the starter kit could not be generated.");
    }
  }, [selected]);

  function download(file: { path: string; contents: string }) {
    const blob = new Blob([file.contents], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.path;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (interfaces.length === 0) {
    return (
      <section style={card}>
        <h2 style={h2}>No interfaces to test</h2>
        <p style={body}>
          Add an interface from Discover first. The Test Console runs a real read against the
          connected tenant using that interface&apos;s configuration.
        </p>
      </section>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={card}>
        <h2 style={h2}>Run a read</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "block" }}>
            <span style={labelText}>Interface</span>
            <select
              value={selectedId ?? ""}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setChosenClientId(null);
                // A query names one interface's fields.
                setQueryText("");
              }}
              style={field}
            >
              {interfaces.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.solutionName}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block" }}>
            <span style={labelText}>Entity set</span>
            {/*
              A SELECT, not free text.

              This value is concatenated into an OData path aimed at a real
              client tenant, and the Interfaces record declares the valid name
              (`A_BankDetail`) — accepting arbitrary typing offered nothing
              except a way to send malformed paths upstream. The broker run
              does not enumerate $metadata (that was the ungoverned /entities
              route), so the declared entity set is the offer; the server
              validates regardless — this is the affordance, not the control.
            */}
            <select
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              style={{ ...field, width: 220 }}
              disabled={!selected}
            >
              <option value="">
                {selected?.entitySet ? `${selected.entitySet} (declared)` : "First available"}
              </option>
              {knownEntitySets
                .filter((name) => name !== selected?.entitySet)
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
          <label style={{ display: "block" }}>
            <span style={labelText}>Rows</span>
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(100, Number(e.target.value) || 10)))}
              style={{ ...field, width: 90 }}
            />
          </label>
          <button
            type="button"
            onClick={() => void doRun()}
            disabled={run.phase === "running" || !selected}
            style={btnPrimary}
            title="Run through the broker — the same pipeline the deployed app uses"
          >
            {run.phase === "running" ? "Running…" : "Run"}
          </button>
        </div>
        {/* WHERE THE RUN WILL GO, said before it goes. The binding follows the
            solution credential's environment, not the top-bar tenant picker;
            without this line the only way to learn which system a run would
            reach was to run it and read the "Bound to" that came back. */}
        {selected && selected.credentials.length > 1 && (
          <label style={{ display: "block", marginTop: 10 }}>
            <span style={labelText}>Run as</span>
            <select
              value={credential?.clientId ?? ""}
              onChange={(e) => setChosenClientId(e.target.value)}
              style={{ ...field, width: 320 }}
              aria-label="Run as credential"
            >
              {selected.credentials.map((c) => (
                <option key={c.clientId} value={c.clientId}>
                  {c.binding.credential.label} ({c.binding.credential.environment}
                  {c.binding.credential.sapClient ? `/${c.binding.credential.sapClient}` : ""})
                </option>
              ))}
            </select>
          </label>
        )}
        {selected && <BindingPreviewLine binding={credential?.binding ?? { kind: "no-credential" }} />}
        {selected && selected.operation === "READ" && (
          <QueryInput key={selected.id} interfaceId={selected.id} value={queryText} onChange={setQueryText} />
        )}
        <p style={{ ...muted, marginTop: 10 }}>
          Nothing is read until you press Run. The run goes through the broker: the same
          grant check, the same environment binding, the same connection the deployed
          application would reach — and it is recorded in the northbound trail as a dry run.
          The tenant selected in the top bar applies to Discover, not to this run.
        </p>
      </section>

      {run.phase === "done" && (
        <section style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <h2 style={{ ...h2, margin: 0 }}>{run.refusal ? "Refused by governance" : "Result"}</h2>
            {run.status && <StudioStatusChip status={run.status} label={run.statusLabel} meaning={run.statusMeaning} />}
            {run.httpStatus && <span style={muted}>HTTP {run.httpStatus}</span>}
            {run.draft && (
              <span style={{ ...muted, color: "var(--status-awaiting-fg)" }} title="Served with x-coreedge-interface-status: DRAFT">
                draft interface
              </span>
            )}
          </div>
          <p style={body}>{run.detail}</p>
          {run.refusal?.query && <QueryRuleLine detail={run.refusal.query} />}
          {run.query && <QueryRunLine info={run.query} />}
          {/* WHICH system answered — the binding's own facts, so a green run is
              evidence about the connection the app will actually reach. */}
          {run.boundTo && (
            <p style={{ ...muted, marginTop: 6 }}>
              Bound to <strong>{run.boundTo.label}</strong>
              {run.boundTo.environment ? ` · ${run.boundTo.environment}` : ""}
              {run.boundTo.sapClient ? `/${run.boundTo.sapClient}` : ""}
              {run.boundTo.bindingUnverified
                ? " · binding unverified (the connection has not declared its environment)"
                : ""}
            </p>
          )}

          {/* The rows scroll sideways (eight unwrapped columns), so the box must
              take keyboard focus to be scrolled without a pointer (axe
              scrollable-region-focusable); the global [tabindex]:focus-visible
              rule draws its ring. */}
          {run.rows && run.rows.length > 0 && (
            <div tabIndex={0} role="region" aria-label="Rows read" style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface-ink-tint)", textAlign: "left" }}>
                    {Object.keys(run.rows[0] ?? {}).slice(0, 8).map((k) => (
                      <th key={k} style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {run.rows.slice(0, 20).map((row, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border-default)" }}>
                      {Object.keys(run.rows![0] ?? {}).slice(0, 8).map((k) => (
                        <td key={k} style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                          {String(row[k] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ONLY ON A REAL SUCCESS. This line was keyed on `rows.length === 0`
              alone, which is true of every failure too — a refusal returns no
              rows either. So a tenant answering 403 rendered "Needs setup · HTTP
              403" and then, thirty pixels below, told the developer to treat the
              refusal as data.

              That is the same false sentence the honest-status fix was raised
              for, surviving in the same card because only the badge, the status
              and the detail were made outcome-aware. The condition has to read
              the OUTCOME, not the row count: emptiness is a property of a
              successful read, and nothing else may claim it. */}
          {run.status === "ACTIVATED" && run.rows && run.rows.length === 0 && run.query?.status !== "NO_RECORD" && (
            <p style={{ ...muted, marginTop: 8 }}>
              This is an empty resource, not a failure. Your application should treat it as data.
            </p>
          )}

          {canSave && (
            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => void saveCase()} disabled={saving} style={btnSmall}>
                {saving ? "Saving…" : "Save as test case"}
              </button>
              {/* Only offered when there are rows to learn from — capturing an
                  empty result would teach the contract nothing. Never for a
                  query run (P1.4): its rows describe the query, not the contract. */}
              {!run.query && run.rows && run.rows.length > 0 && (
                <button type="button" onClick={() => void captureSchema()} disabled={capturing} style={btnSmall}>
                  {capturing ? "Capturing…" : "Capture schema"}
                </button>
              )}
              {/* Offered for EVERY honest outcome, including the failures — a
                  mock that can only serve the happy path lets a test suite prove
                  the easy half. */}
              {!run.query && (
                <button type="button" onClick={() => void captureFixture()} disabled={capturing} style={btnSmall}>
                  {capturing ? "Capturing…" : "Capture fixture"}
                </button>
              )}
              {run.query && (
                <span style={muted}>Capture is offered for ?limit runs: a query&apos;s rows are shaped by its select and filters.</span>
              )}
              {saved && <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>{saved}</span>}
            </div>
          )}
        </section>
      )}

      {cases.length > 0 && (
        <section style={card}>
          <h2 style={h2}>Saved test cases</h2>
          <p style={body}>
            Replays run through the broker — the same grant, binding and connection a fresh
            Run uses — so a case that passed last month can be checked against today.
          </p>
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
            {cases.map((c) => (
              <li
                key={c.id}
                style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid var(--border-default)" }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                {/* A PASS WITH NO STATUS IS A PASS NOBODY CAN CHECK. Cases saved
                    before runs carried the tenant's status — and before the
                    console went through the broker at all — sit in this list as
                    "PASS 29 Jul" for services that 403 on every tenant today.
                    The record is kept (it is history), but it is not rendered
                    as evidence: it says what it lacks, and Replay is the cure. */}
                {c.lastOutcome === "PASS" && c.httpStatus === null ? (
                  <span
                    style={{ ...muted, color: "var(--status-awaiting-fg)" }}
                    title="Saved before runs recorded the tenant's HTTP status, so this PASS cannot say what it passed against. Replay to check it against today's tenant through the broker."
                  >
                    last: PASS · unevidenced
                    {c.lastRunAt ? ` · ${formatDate(c.lastRunAt)}` : ""}
                    {" — recorded before runs carried their status; replay to check"}
                  </span>
                ) : (
                  <span style={muted}>
                    last: {c.lastOutcome}
                    {c.httpStatus ? ` · HTTP ${c.httpStatus}` : ""}
                    {c.lastRunAt ? ` · ${formatDate(c.lastRunAt)}` : ""}
                  </span>
                )}
                {caseResult[c.id] && (
                  <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>now: {caseResult[c.id]}</span>
                )}
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button type="button" style={btnSmall} disabled={caseBusy === c.id} onClick={() => void replayCase(c)}>
                    {caseBusy === c.id ? "…" : "Replay"}
                  </button>
                  {canSave && (
                    <button type="button" style={btnSmall} disabled={caseBusy === c.id} onClick={() => void deleteCase(c.id)}>
                      Delete
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={card}>
        <h2 style={h2}>Scaffold</h2>
        <p style={body}>
          Generate a typed contract and a starter client for this interface. This is the
          hand-off point: <strong>the solution&apos;s application code lives in your own
          repository</strong>, in whatever stack you use. There is no editor here, by design.
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void loadScaffold()} disabled={!selected} style={btnPrimary}>
            Generate
          </button>
          {files?.map((f) => (
            <button key={f.path} type="button" onClick={() => download(f)} style={btnSmall}>
              ⭳ {f.path}
            </button>
          ))}
        </div>
        {scaffoldError && (
          <p role="alert" style={{ ...muted, marginTop: 10, color: "var(--status-awaiting-fg)" }} data-testid="scaffold-error">
            {scaffoldError}
          </p>
        )}
        {files && (
          <p style={{ ...muted, marginTop: 10 }}>
            The OpenAPI document is the portable artifact — generate a client in any language
            from it with <code style={code}>openapi-generator</code>.
          </p>
        )}
      </section>
    </div>
  );
}

/** "Runs as <credential> → binds to <connection>", or the refusal the run would get. */
function BindingPreviewLine({ binding }: { binding: BindingPreview }) {
  if (binding.kind === "no-credential") {
    return (
      <p style={{ ...muted, marginTop: 10, color: "var(--status-awaiting-fg)" }} data-testid="binding-preview">
        This solution has no live runtime credential, so Run will be refused before it reaches a
        tenant — the deployed application would be too. Issue one under API Access.
      </p>
    );
  }
  const cred = `${binding.credential.label} (${binding.credential.environment}${binding.credential.sapClient ? `/${binding.credential.sapClient}` : ""})`;
  if (binding.kind === "refused") {
    return (
      <p style={{ ...muted, marginTop: 10, color: "var(--status-awaiting-fg)" }} data-testid="binding-preview">
        Runs as <strong>{cred}</strong> — and will be refused at the binding: {binding.message}
      </p>
    );
  }
  return (
    <p style={{ ...muted, marginTop: 10 }} data-testid="binding-preview">
      Runs as <strong>{cred}</strong> → will bind to <strong>{binding.connection.label}</strong>
      {binding.connection.environment ? ` · ${binding.connection.environment}` : ""}
      {binding.connection.sapClient ? `/${binding.connection.sapClient}` : ""}
      {binding.bindingUnverified
        ? " · binding unverified (the connection has not declared its environment)"
        : ""}
    </p>
  );
}

/**
 * The query the deployed app would send, typed or built from the policy
 * (P1.4). The policy is a Postgres read, made when the builder is opened.
 */
function QueryInput({ interfaceId, value, onChange }: { interfaceId: string; value: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const [policy, setPolicy] = useState<BuilderPolicy | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [op, setOp] = useState("");
  const [literal, setLiteral] = useState("");
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const inputId = `console-query-${interfaceId}`;

  const openBuilder = async () => {
    setOpen(true);
    if (policy) return;
    try {
      const res = await fetch(`/api/studio/interfaces/${encodeURIComponent(interfaceId)}/query-policy`);
      const json = (await res.json()) as { data?: BuilderPolicy; error?: { message?: string } };
      if (!res.ok || !json.data) throw new Error(json.error?.message ?? "The query policy could not be loaded.");
      setPolicy(json.data);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "The query policy could not be loaded.");
    }
  };

  const ready = policy?.compiled?.state === "READY" ? policy.compiled : null;
  const filterable = ready?.fields.filter((f) => f.ops.length > 0) ?? [];
  const chosen = filterable.find((f) => f.n === fieldName) ?? null;
  const params = () => new URLSearchParams(value.trim().replace(/^\?/, ""));

  return (
    <div style={{ marginTop: 12 }}>
      <label htmlFor={inputId} style={labelText}>
        Query parameters (optional) — as the deployed app would send them
      </label>
      <input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="select=Order,Customer&filter.Customer.eq=17100001&pageSize=20"
        spellCheck={false}
        maxLength={4096}
        style={{ ...field, width: "100%", maxWidth: 640, fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: 13 }}
      />
      <p style={{ ...muted, marginTop: 4 }}>
        Empty runs the ?limit read. With parameters, the run is the first page of that query (at most 50 records), checked
        against the interface&apos;s query policy as the app&apos;s call is. Send a + in a value as %2B.
      </p>
      {!open ? (
        <button type="button" style={{ ...btnSmall, marginTop: 6 }} onClick={() => void openBuilder()}>
          Build from the query policy
        </button>
      ) : (
        <fieldset style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-input, 8px)", padding: "10px 12px", marginTop: 8 }}>
          <legend style={{ ...labelText, padding: "0 4px", marginBottom: 0 }}>Build from the query policy</legend>
          {problem && <p role="alert" style={{ ...muted, color: "var(--status-revoked-fg)" }}>{problem}</p>}
          {policy && !ready && (
            <p style={muted}>
              This interface serves no queries yet: enable them in its Query policy card under Interfaces.
            </p>
          )}
          {policy && !policy.flagEnabled && (
            <p style={muted}>This deployment does not serve queries yet (COREEDGE_QUERY_SURFACE), so a query run is refused.</p>
          )}
          {ready && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={{ display: "block" }}>
                  <span style={labelText}>Filter on</span>
                  <select
                    value={fieldName}
                    onChange={(e) => {
                      setFieldName(e.target.value);
                      setOp(filterable.find((f) => f.n === e.target.value)?.ops[0] ?? "");
                    }}
                    style={{ ...field, width: 200 }}
                  >
                    <option value="">Choose a field</option>
                    {filterable.map((f) => (
                      <option key={f.n} value={f.n}>
                        {f.n}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "block" }}>
                  <span style={labelText}>Operator</span>
                  <select value={op} onChange={(e) => setOp(e.target.value)} disabled={!chosen} style={{ ...field, width: 160 }}>
                    {(chosen?.ops ?? []).map((o) => (
                      <option key={o} value={o}>
                        {OP_LABEL[o] ?? o}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "block" }}>
                  <span style={labelText}>Value</span>
                  <input value={literal} onChange={(e) => setLiteral(e.target.value)} disabled={!chosen} style={{ ...field, width: 180 }} />
                </label>
                <button
                  type="button"
                  style={btnSmall}
                  disabled={!chosen || !op}
                  onClick={() => {
                    const next = params();
                    next.append(`filter.${fieldName}.${op}`, literal);
                    onChange(next.toString());
                    setLiteral("");
                  }}
                >
                  Add filter
                </button>
              </div>
              {ready.key && ready.key.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  {ready.key.map((k) => (
                    <label key={k} style={{ display: "block" }}>
                      <span style={labelText}>Key {k}</span>
                      <input
                        value={keyValues[k] ?? ""}
                        onChange={(e) => setKeyValues((v) => ({ ...v, [k]: e.target.value }))}
                        style={{ ...field, width: 160 }}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    style={btnSmall}
                    disabled={ready.key.some((k) => !keyValues[k])}
                    onClick={() => {
                      // A key lookup carries only select beside the key.
                      const select = params().get("select");
                      const next = new URLSearchParams();
                      if (select) next.set("select", select);
                      for (const k of ready.key ?? []) next.set(`key.${k}`, keyValues[k] ?? "");
                      onChange(next.toString());
                    }}
                  >
                    Look up by key
                  </button>
                </div>
              )}
              <p style={muted}>
                Readable: {ready.fields.map((f) => f.n).join(", ") || "none"}. Sortable: {ready.fields.filter((f) => f.sort).map((f) => f.n).join(", ") || "none"}.
              </p>
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}

/** A query refusal's rule, and what the policy allows instead when it says. */
function QueryRuleLine({ detail }: { detail: QueryRefusalDetail }) {
  return (
    <p style={{ ...muted, marginTop: 6 }} data-testid="query-rule">
      Rule <code style={code}>{detail.rule}</code>
      {detail.parameter ? <> on <code style={code}>{detail.parameter}</code></> : null}
      {detail.allowed && detail.allowed.length > 0 ? ` · allowed: ${detail.allowed.join(", ")}` : ""}
    </p>
  );
}

/** What a query run sent (never the host), and what its first page says. */
function QueryRunLine({ info }: { info: QueryRunInfo }) {
  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }} data-testid="query-run">
      <p style={{ ...muted, margin: 0 }}>
        Sent to SAP ({info.kind === "LIST" ? "a list" : "a key lookup"}): <code style={{ ...code, wordBreak: "break-all" }}>{info.sent}</code>
      </p>
      {info.rule && (
        <p style={{ ...muted, margin: 0 }}>
          Rule <code style={code}>{info.rule}</code>
        </p>
      )}
      {info.page && (
        <p style={{ ...muted, margin: 0 }}>
          First page: {info.page.rowsServed} record{info.page.rowsServed === 1 ? "" : "s"}
          {info.page.complete
            ? " · SAP has no more rows for this query"
            : info.page.stopped
              ? ` · rows remain, and paging stops here (${info.page.stopped})`
              : " · more rows remain: the deployed app pages on nextCursor"}
          {info.totalCount !== undefined ? ` · total count ${info.totalCount ?? "not given by SAP"}` : ""}
        </p>
      )}
    </div>
  );
}

/* ── presentation ─────────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  background: "var(--surface-paper)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card-warm, 12px)",
  boxShadow: "0 1px 2px rgba(0,0,0,.04)",
  padding: 20,
};

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: 16, lineHeight: "24px", fontWeight: 600 };
const body: React.CSSProperties = { margin: 0, fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)" };
const muted: React.CSSProperties = { fontSize: 12, lineHeight: "18px", color: "var(--ink-muted)" };
const code: React.CSSProperties = { background: "var(--surface-ink-tint)", borderRadius: 4, padding: "1px 5px", fontSize: 12 };

const labelText: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--ink-secondary)",
};

const field: React.CSSProperties = {
  height: 40,
  borderRadius: "var(--radius-input, 8px)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-paper)",
  color: "var(--ink-primary)",
  fontSize: 14,
  padding: "0 8px",
};

const btnPrimary: React.CSSProperties = {
  height: 40, padding: "0 16px", borderRadius: "var(--radius-input, 8px)",
  background: "var(--brand-navy)", color: "var(--surface-paper)",
  border: "1px solid var(--brand-navy)", fontSize: 14, fontWeight: 600, cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  height: 32, padding: "0 12px", borderRadius: "var(--radius-input, 8px)",
  background: "var(--surface-paper)", color: "var(--brand-navy)",
  border: "1px solid var(--brand-navy)", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
