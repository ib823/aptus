/**
 * The post-deploy check of the CoreEdge release protocol (P0.17,
 * docs/runbooks/coreedge-release.md, step 5).
 *
 * After a deployment is promoted (or, in step 3, against its preview), one
 * run answers "is the governed path working on the build that is live?":
 *
 *   build         /api/build names the commit serving (and, when told which
 *                 commit to expect, that it is that one)
 *   health        /api/health answers healthy (the app reaches its database)
 *   discovery     the canary app's key lists the SAP-standard interface as a
 *                 catalogue service and the Z* one as a customer-built
 *                 (custom) service, both callable
 *   standard read one governed read of the SAP-standard interface: 200
 *   custom read   one governed read of the Z* or YY1_* interface: 200
 *   refused       one call the broker must refuse: 403 FORBIDDEN for an
 *                 interface with no grant in the key's environment, or 404
 *                 NOT_FOUND for an id that is not the app's
 *   audit         every one of those calls left its NorthboundAuditEvent row,
 *                 found by correlation id, with the status the caller got
 *
 * Everything comes from the environment (`readPostDeployConfig`); nothing it
 * prints contains the key, the bypass secret or the database URL (every line
 * goes through redactSecrets), and no SAP record is ever printed: only
 * statuses, counts and correlation ids. Each read asks for one record.
 *
 * Pure apart from the `fetch` and audit lookup it is given, so the tests run
 * it against a fake deployment.
 */

import { redactSecrets } from "./redact";

export type CheckStatus = "PASS" | "FAIL";

export interface CheckLine {
  readonly id: "build" | "health" | "discovery" | "standard-read" | "custom-read" | "refused" | "audit";
  readonly title: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface PostDeployConfig {
  /** Origin only, no trailing slash: https://ab-workbench.vercel.app */
  readonly baseUrl: string;
  readonly key: string;
  /** The key for the custom interface; the same key unless it is another app's. */
  readonly customKey: string;
  readonly standardInterfaceId: string;
  readonly customInterfaceId: string;
  /** An interface of the app with no grant in the key's environment, or null. */
  readonly refusedInterfaceId: string | null;
  readonly expectCommit: string | null;
  /** Vercel Deployment Protection bypass secret, for a protected preview. */
  readonly protectionBypass: string | null;
  readonly auditDatabaseUrl: string;
  readonly timeoutMs: number;
}

export const ENV = {
  baseUrl: "COREEDGE_CHECK_BASE_URL",
  key: "COREEDGE_CHECK_KEY",
  customKey: "COREEDGE_CHECK_CUSTOM_KEY",
  standardInterfaceId: "COREEDGE_CHECK_STANDARD_INTERFACE",
  customInterfaceId: "COREEDGE_CHECK_CUSTOM_INTERFACE",
  refusedInterfaceId: "COREEDGE_CHECK_REFUSED_INTERFACE",
  expectCommit: "COREEDGE_CHECK_EXPECT_COMMIT",
  protectionBypass: "COREEDGE_CHECK_PROTECTION_BYPASS",
  auditDatabaseUrl: "COREEDGE_CHECK_AUDIT_DATABASE_URL",
} as const;

/** An interface id no app has: the refused call when no ungranted interface is named. */
export const UNKNOWN_INTERFACE_ID = "post-deploy-check-no-such-interface";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The values a run holds that must never be printed. */
export function secretsOf(config: Partial<PostDeployConfig>): string[] {
  return [config.key, config.customKey, config.protectionBypass, config.auditDatabaseUrl].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
}

export function readPostDeployConfig(
  env: Readonly<Record<string, string | undefined>>,
): { ok: true; config: PostDeployConfig } | { ok: false; problems: string[] } {
  const get = (name: string): string | null => {
    const v = env[name]?.trim();
    return v ? v : null;
  };
  const problems: string[] = [];

  let baseUrl = "";
  const rawBase = get(ENV.baseUrl);
  if (!rawBase) problems.push(`${ENV.baseUrl} is not set (the deployment to check, e.g. https://ab-workbench.vercel.app)`);
  else {
    try {
      const u = new URL(rawBase);
      if (u.username || u.password) problems.push(`${ENV.baseUrl} must not carry credentials`);
      else if (u.protocol !== "https:" && !(u.protocol === "http:" && LOCAL_HOSTS.has(u.hostname)))
        problems.push(`${ENV.baseUrl} must be https (http only for localhost)`);
      else if ((u.pathname !== "/" && u.pathname !== "") || u.search || u.hash)
        problems.push(`${ENV.baseUrl} must be an origin only (no path, query or fragment)`);
      else baseUrl = u.origin;
    } catch {
      problems.push(`${ENV.baseUrl} is not a URL`);
    }
  }

  const key = get(ENV.key);
  if (!key) problems.push(`${ENV.key} is not set (the canary app's runtime key)`);
  else if (!key.startsWith("ce_")) problems.push(`${ENV.key} is not a CoreEdge runtime key (it does not start with ce_)`);
  const customKey = get(ENV.customKey) ?? key;
  if (customKey && !customKey.startsWith("ce_")) problems.push(`${ENV.customKey} is not a CoreEdge runtime key`);

  const standardInterfaceId = get(ENV.standardInterfaceId);
  if (!standardInterfaceId) problems.push(`${ENV.standardInterfaceId} is not set (the canary's SAP-standard interface id)`);
  const customInterfaceId = get(ENV.customInterfaceId);
  if (!customInterfaceId) problems.push(`${ENV.customInterfaceId} is not set (the canary's Z* or YY1_* interface id)`);
  const refusedInterfaceId = get(ENV.refusedInterfaceId);
  if (standardInterfaceId && standardInterfaceId === customInterfaceId)
    problems.push(`${ENV.standardInterfaceId} and ${ENV.customInterfaceId} are the same interface`);
  if (refusedInterfaceId && (refusedInterfaceId === standardInterfaceId || refusedInterfaceId === customInterfaceId))
    problems.push(`${ENV.refusedInterfaceId} must be an interface with no grant, not one of the two reads`);

  const auditDatabaseUrl = get(ENV.auditDatabaseUrl);
  if (!auditDatabaseUrl)
    problems.push(`${ENV.auditDatabaseUrl} is not set (a read-only URL of the deployment's database, to find the audit rows)`);

  const expectCommit = get(ENV.expectCommit);
  if (expectCommit && !/^[0-9a-f]{7,40}$/i.test(expectCommit)) problems.push(`${ENV.expectCommit} is not a commit SHA`);

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    config: {
      baseUrl,
      key: key!,
      customKey: customKey!,
      standardInterfaceId: standardInterfaceId!,
      customInterfaceId: customInterfaceId!,
      refusedInterfaceId,
      expectCommit: expectCommit?.toLowerCase() ?? null,
      protectionBypass: get(ENV.protectionBypass),
      auditDatabaseUrl: auditDatabaseUrl!,
      timeoutMs: 20_000,
    },
  };
}

/** One audit row, as much of it as the check compares. */
export interface AuditRow {
  readonly correlationId: string;
  readonly status: number;
  readonly interfaceId: string | null;
}

export type AuditLookup = (correlationIds: readonly string[]) => Promise<readonly AuditRow[]>;

export interface PostDeployDeps {
  readonly fetch: typeof fetch;
  readonly findAuditRows: AuditLookup;
  readonly now?: () => Date;
  /** Waits between audit lookups; tests pass a no-op. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface PostDeployReport {
  readonly ok: boolean;
  readonly target: string;
  readonly checkedAt: string;
  readonly commit: string | null;
  readonly deployment: string | null;
  readonly environment: string | null;
  readonly lines: readonly CheckLine[];
  /** Every governed call made, for the record: what an operator quotes to find its row. */
  readonly calls: readonly { readonly label: string; readonly correlationId: string | null; readonly status: number | null }[];
}

interface CallResult {
  readonly status: number | null;
  readonly correlationId: string | null;
  readonly body: unknown;
  readonly error: string | null;
}

interface Expected {
  readonly label: string;
  readonly correlationId: string;
  readonly status: number;
  readonly interfaceId: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function runPostDeployCheck(config: PostDeployConfig, deps: PostDeployDeps): Promise<PostDeployReport> {
  const secrets = secretsOf(config);
  const clean = (s: string): string => redactSecrets(s, secrets).replace(/\s+/g, " ").slice(0, 200);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const lines: CheckLine[] = [];
  const calls: { label: string; correlationId: string | null; status: number | null }[] = [];
  const expected: Expected[] = [];
  const add = (id: CheckLine["id"], title: string, pass: boolean, detail: string) =>
    lines.push({ id, title, status: pass ? "PASS" : "FAIL", detail: clean(detail) });

  const call = async (path: string, key: string | null): Promise<CallResult> => {
    const headers: Record<string, string> = { accept: "application/json" };
    if (key) headers.authorization = `Bearer ${key}`;
    if (config.protectionBypass) headers["x-vercel-protection-bypass"] = config.protectionBypass;
    try {
      const res = await deps.fetch(`${config.baseUrl}${path}`, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      const fromBody = isRecord(body) && isRecord(body.error) && typeof body.error.correlationId === "string" ? body.error.correlationId : null;
      return { status: res.status, correlationId: res.headers.get("x-correlation-id") ?? fromBody, body, error: null };
    } catch (err) {
      // Node's fetch says only "fetch failed"; the cause names it (ECONNREFUSED, ENOTFOUND, a timeout).
      const cause = err instanceof Error && isRecord(err.cause) ? (err.cause.code ?? err.cause.name) : null;
      const message = err instanceof Error ? err.message : String(err);
      return { status: null, correlationId: null, body: null, error: typeof cause === "string" ? `${message}: ${cause}` : message };
    }
  };
  const describe = (r: CallResult): string => {
    if (r.error) return `no answer (${r.error})`;
    const code = isRecord(r.body) && isRecord(r.body.error) ? r.body.error.code : null;
    const message = isRecord(r.body) && isRecord(r.body.error) ? r.body.error.message : null;
    const redirect = r.status !== null && r.status >= 300 && r.status < 400 ? " (a redirect: deployment protection or a sign-in page, not the app)" : "";
    return `HTTP ${r.status}${typeof code === "string" ? ` ${code}` : ""}${typeof message === "string" ? `: ${message}` : ""}${redirect}`;
  };
  const withId = (r: CallResult): string => (r.correlationId ? ` [correlation ${r.correlationId}]` : "");

  // build
  const build = await call("/api/build", null);
  const buildBody = isRecord(build.body) ? build.body : {};
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  const commit = str(buildBody.commit);
  const deployment = str(buildBody.deployment);
  const environment = str(buildBody.environment);
  if (build.status !== 200) add("build", "The build stamp answers", false, describe(build));
  else if (config.expectCommit && !(commit ?? "").toLowerCase().startsWith(config.expectCommit))
    add("build", "The expected commit is serving", false, `serving ${commit ?? "an unstamped build"}, expected ${config.expectCommit}`);
  else
    add(
      "build",
      config.expectCommit ? "The expected commit is serving" : "The build stamp answers",
      true,
      `commit ${commit ?? "not reported"}, ${environment ?? "no"} environment, deployment ${deployment ?? "not reported"}`,
    );

  // health
  const health = await call("/api/health", null);
  const healthy = health.status === 200 && isRecord(health.body) && health.body.status === "healthy";
  add("health", "The app reaches its database", healthy, healthy ? "healthy" : describe(health));

  // discovery
  type Listed = { id: string; callable: boolean; refusal: string | null; source: string | null };
  const listedBy = new Map<string, Map<string, Listed>>();
  const discover = async (key: string, label: string): Promise<Map<string, Listed> | string> => {
    const r = await call("/api/northbound/interfaces", key);
    calls.push({ label, correlationId: r.correlationId, status: r.status });
    if (r.status !== 200) return describe(r) + withId(r);
    if (r.correlationId) expected.push({ label, correlationId: r.correlationId, status: 200, interfaceId: null });
    const data = isRecord(r.body) && isRecord(r.body.data) ? r.body.data : null;
    const list = data && Array.isArray(data.interfaces) ? data.interfaces : null;
    if (!list) return "HTTP 200 without an interface list";
    const out = new Map<string, Listed>();
    for (const i of list) {
      if (!isRecord(i) || typeof i.id !== "string") continue;
      out.set(i.id, {
        id: i.id,
        callable: i.callable === true,
        refusal: typeof i.refusal === "string" ? i.refusal : null,
        source: isRecord(i.service) && typeof i.service.source === "string" ? i.service.source : null,
      });
    }
    return out;
  };
  const discoveryProblems: string[] = [];
  const discoveryNotes: string[] = [];
  for (const [key, label] of config.customKey === config.key
    ? ([[config.key, "discovery"]] as const)
    : ([[config.key, "discovery"], [config.customKey, "discovery (custom key)"]] as const)) {
    const got = await discover(key, label);
    if (typeof got === "string") discoveryProblems.push(`${label}: ${got}`);
    else listedBy.set(key, got);
  }
  const judge = (key: string, id: string, want: "catalogue" | "custom", name: string) => {
    const listed = listedBy.get(key);
    if (!listed) return;
    const i = listed.get(id);
    if (!i) discoveryProblems.push(`${name} ${id} is not listed for this key`);
    else if (i.source !== want) discoveryProblems.push(`${name} ${id} is a ${i.source ?? "unlabelled"} service, expected ${want}`);
    else if (!i.callable) discoveryProblems.push(`${name} ${id} is not callable (${i.refusal ?? "no reason given"})`);
    else discoveryNotes.push(`${name} is ${want} and callable`);
  };
  judge(config.key, config.standardInterfaceId, "catalogue", "the SAP-standard interface");
  judge(config.customKey, config.customInterfaceId, "custom", "the Z* interface");
  if (config.refusedInterfaceId) {
    const i = listedBy.get(config.key)?.get(config.refusedInterfaceId);
    if (!listedBy.has(config.key)) {
      // Already reported above.
    } else if (!i) discoveryProblems.push(`the refused interface ${config.refusedInterfaceId} is not listed for this key`);
    else if (i.callable) discoveryProblems.push(`the refused interface ${config.refusedInterfaceId} is callable: it has a grant, so it proves no refusal`);
    else discoveryNotes.push(`the refused interface is listed as not callable (${i.refusal ?? "no reason"})`);
  }
  add(
    "discovery",
    "Discovery lists the canary interfaces as expected",
    discoveryProblems.length === 0,
    discoveryProblems.length === 0 ? discoveryNotes.join("; ") : discoveryProblems.join("; "),
  );

  // the two reads
  const read = async (id: CheckLine["id"], title: string, key: string, interfaceId: string) => {
    const r = await call(`/api/northbound/interfaces/${encodeURIComponent(interfaceId)}/data?limit=1`, key);
    calls.push({ label: id, correlationId: r.correlationId, status: r.status });
    if (r.correlationId && r.status !== null) expected.push({ label: id, correlationId: r.correlationId, status: r.status, interfaceId });
    const data = isRecord(r.body) && isRecord(r.body.data) ? r.body.data : null;
    if (r.status === 200 && data && typeof data.count === "number") {
      add(id, title, true, `HTTP 200, ${data.count} record${data.count === 1 ? "" : "s"}${data.empty === true ? " (an empty resource)" : ""}${withId(r)}`);
    } else {
      add(id, title, false, describe(r) + withId(r));
    }
  };
  await read("standard-read", "One SAP-standard read through the broker", config.key, config.standardInterfaceId);
  await read("custom-read", "One Z* (customer-built) read through the broker", config.customKey, config.customInterfaceId);

  // the refusal
  const refusedId = config.refusedInterfaceId ?? UNKNOWN_INTERFACE_ID;
  const want = config.refusedInterfaceId ? { status: 403, code: "FORBIDDEN" } : { status: 404, code: "NOT_FOUND" };
  const refused = await call(`/api/northbound/interfaces/${encodeURIComponent(refusedId)}/data?limit=1`, config.key);
  calls.push({ label: "refused", correlationId: refused.correlationId, status: refused.status });
  if (refused.correlationId && refused.status !== null)
    expected.push({ label: "refused", correlationId: refused.correlationId, status: refused.status, interfaceId: refusedId });
  const refusedCode = isRecord(refused.body) && isRecord(refused.body.error) ? refused.body.error.code : null;
  add(
    "refused",
    config.refusedInterfaceId ? "A call with no grant is refused" : "A call for another app's interface is refused",
    refused.status === want.status && refusedCode === want.code,
    refused.status === want.status && refusedCode === want.code
      ? `HTTP ${want.status} ${want.code}${withId(refused)}`
      : `${describe(refused)}${withId(refused)}, expected HTTP ${want.status} ${want.code}`,
  );

  // the audit rows
  const reads = ["standard-read", "custom-read", "refused"];
  const missingIds = reads.filter((label) => !calls.some((c) => c.label === label && c.correlationId));
  if (expected.length === 0) {
    add("audit", "Every governed call left its audit row", false, "no call returned a correlation id to look up");
  } else {
    let rows: readonly AuditRow[] = [];
    let lookupError: string | null = null;
    // The rows are written before the response is sent; the retries cover a
    // lagging read replica, not a slow write.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        rows = await deps.findAuditRows(expected.map((e) => e.correlationId));
        lookupError = null;
      } catch (err) {
        lookupError = err instanceof Error ? err.message : String(err);
      }
      if (!lookupError && expected.every((e) => rows.some((r) => r.correlationId === e.correlationId))) break;
      if (attempt < 2) await sleep(1_000);
    }
    const problems: string[] = [];
    if (lookupError) problems.push(`the audit lookup failed: ${lookupError}`);
    else {
      for (const e of expected) {
        const row = rows.find((r) => r.correlationId === e.correlationId);
        if (!row) problems.push(`${e.label}: no audit row for ${e.correlationId}`);
        else if (row.status !== e.status) problems.push(`${e.label}: audited ${row.status}, the caller got ${e.status}`);
        else if (e.interfaceId !== null && row.interfaceId !== e.interfaceId)
          problems.push(`${e.label}: audited against interface ${row.interfaceId ?? "none"}`);
      }
    }
    for (const label of missingIds) problems.push(`${label}: the response carried no correlation id`);
    add(
      "audit",
      "Every governed call left its audit row",
      problems.length === 0,
      problems.length === 0 ? `${expected.length} rows found by correlation id, statuses match` : problems.join("; "),
    );
  }

  return {
    ok: lines.every((l) => l.status === "PASS"),
    target: config.baseUrl,
    checkedAt: (deps.now?.() ?? new Date()).toISOString(),
    commit,
    deployment,
    environment,
    lines,
    calls,
  };
}

/** The checklist for a terminal. */
export function formatText(report: PostDeployReport): string {
  const out = [`CoreEdge post-deploy check: ${report.target} at ${report.checkedAt}`];
  for (const l of report.lines) out.push(`  [${l.status}] ${l.title}: ${l.detail}`);
  const failed = report.lines.filter((l) => l.status === "FAIL").length;
  out.push(
    report.ok
      ? `RESULT: PASS (${report.lines.length}/${report.lines.length})`
      : `RESULT: FAIL (${failed} of ${report.lines.length} failed). Follow "If the check fails" in docs/runbooks/coreedge-release.md.`,
  );
  return out.join("\n");
}

/**
 * The record of a production deploy: posted on the merged pull request
 * (docs/runbooks/coreedge-release.md, "Record the deploy"). Statuses,
 * correlation ids and the commit only; never a key, a URL with credentials
 * or a record.
 */
export function formatMarkdown(report: PostDeployReport): string {
  const out = [
    `### CoreEdge post-deploy check: ${report.ok ? "PASS" : "FAIL"}`,
    "",
    `- Target: ${report.target}`,
    `- Checked at: ${report.checkedAt}`,
    `- Commit: ${report.commit ?? "not reported"} (${report.environment ?? "unknown"} environment)`,
    `- Deployment: ${report.deployment ?? "not reported"}`,
    "",
  ];
  for (const l of report.lines) out.push(`- [${l.status === "PASS" ? "x" : " "}] **${l.title}**: ${l.detail.replace(/\|/g, "\\|")}`);
  out.push("", "Correlation ids (each finds its row in the feed page's correlation lookup, /coreedge/apps, or in /operations/traffic):", "");
  for (const c of report.calls) out.push(`- ${c.label}: ${c.correlationId ?? "none"} (HTTP ${c.status ?? "no answer"})`);
  out.push("", "Produced by `pnpm release:post-deploy-check --markdown` (P0.17).", "");
  return out.join("\n");
}
