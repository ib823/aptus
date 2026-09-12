/**
 * broker-run's remaining parity with the northbound routes (audit E18, P1).
 *
 * The Test Console's dry run exercises the REAL read pipeline — the same grant
 * check, the same environment binding, the same `readEntitySet` — against a real
 * customer tenant. The audit compared it check-for-check with
 * `authenticateClientToken` and found two things present on every `/api/northbound`
 * route and absent here:
 *
 *   - NO PER-CREDENTIAL RATE LIMIT. It was covered only by middleware's IP-keyed
 *     `sapLive` bucket, which is the wrong shape for the same two reasons it is
 *     wrong on the data route: several consultants behind one office address
 *     throttle each other, and the budget is not the one the credential being
 *     exercised actually has.
 *   - NO `lastUsedAt` UPDATE. A credential exercised daily from Studio looked
 *     dormant on the operations board, which is the screen that exists to spot an
 *     unused credential and retire it.
 *
 * Two things the audit found CORRECT are pinned here as well, because this PR
 * must not quietly change them: the Replay credential logic and the RETIRED
 * refusal.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}
const flat = (src: string) => code(src).replace(/\s+/g, " ");

const BROKER_RUN = "src/app/api/studio/test/broker-run/route.ts";
const DATA_ROUTE = "src/app/api/northbound/interfaces/[id]/data/route.ts";

describe("the per-credential throttle", () => {
  const src = flat(read(BROKER_RUN));

  it("spends the same bucket the deployed application spends", () => {
    // `northbound:` deliberately — the READ bucket, not a third one. The point
    // of a dry run is that it costs what the real call costs, so a console
    // session that would exhaust the application's budget exhausts it here and
    // the builder finds out in Studio rather than in production.
    expect(src).toContain("checkRateLimit(`northbound:${client.id}`");
    expect(src).toContain("RATE_LIMITS.northbound");
  });

  it("uses the same key shape as the data route", () => {
    const dataSrc = flat(read(DATA_ROUTE));
    expect(dataSrc).toContain("checkRateLimit(`northbound:${client.clientId}`");
  });

  it("audits the 429 rather than refusing silently", () => {
    // Every northbound route writes a row before refusing; a throttle nobody can
    // see is indistinguishable from an integration that stopped calling.
    const m = /if \(!rate\.allowed\) \{([\s\S]*?)\n  \}/.exec(code(read(BROKER_RUN)));
    expect(m, "the throttle branch must exist").toBeTruthy();
    expect(m![1]).toContain("recordNorthboundCall");
    expect(m![1]).toContain("status: 429");
    expect(m![1]).toContain("dryRun: true");
  });

  it("throttles AFTER the credential resolves, so the key is the credential", () => {
    const s = flat(read(BROKER_RUN));
    const credentialAt = s.indexOf("const client = liveClients[0]");
    const throttleAt = s.indexOf("checkRateLimit(`northbound:");
    expect(credentialAt).toBeGreaterThan(-1);
    expect(throttleAt).toBeGreaterThan(credentialAt);
  });
});

describe("credential usage is recorded", () => {
  const src = flat(read(BROKER_RUN));

  it("stamps lastUsedAt through the same helper the northbound routes use", () => {
    expect(src).toContain("touchClientLastUsed(client.id, scope.organizationId)");
  });

  it("is fire-and-forget, like every other caller", () => {
    // Failing to stamp a timestamp must never fail the run.
    expect(src).toContain("void touchClientLastUsed");
  });
});

describe("what this PR must NOT have changed", () => {
  const src = read(BROKER_RUN);

  it("the RETIRED refusal still runs first, through the shared function", () => {
    // checkSolutionRuntime is exported precisely so the token path and the
    // console path cannot drift. It is checked before credentials here because a
    // retired solution's console run should not depend on having a credential.
    expect(flat(src)).toContain("checkSolutionRuntime(scope.organizationId, iface.solutionId)");
    const runtimeAt = src.indexOf("checkSolutionRuntime");
    const credentialsAt = src.indexOf("solutionClient.findMany");
    expect(runtimeAt).toBeGreaterThan(-1);
    expect(runtimeAt).toBeLessThan(credentialsAt);
  });

  it("the ambiguity refusal still names the environments to choose between", () => {
    expect(flat(src)).toContain("AMBIGUOUS_CREDENTIAL");
    expect(src).toContain("Pick which one to run as");
  });

  it("the Replay credential logic is untouched", () => {
    // The audit found this correct: a saved case records the environment it ran
    // against, and replay resolves that environment's live credential rather
    // than guessing between several.
    const console = read("src/components/studio/TestConsoleClient.tsx");
    expect(console).toContain("const replayCredential = useCallback(");
    expect(console).toContain("creds.find((x) => x.binding.credential.environment === env)");
    expect(console).toContain("no live ${env} credential");
  });
});
