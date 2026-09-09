// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { runAuditGate } from "../../../scripts/ci-audit-gate.mjs";

function report(severity?: string, direct = false, patched = "<0.0.0") {
  return {
    advisories: severity ? {
      finding: {
        module_name: "example-parser",
        severity,
        github_advisory_id: "GHSA-example",
        patched_versions: patched,
        findings: [{ paths: [direct ? ".>example-parser" : ".>exporter>example-parser"] }],
      },
    } : {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, ...(severity ? { [severity]: 1 } : {}) },
    },
  };
}

function run(raw: string) {
  const log = vi.fn();
  const error = vi.fn();
  const code = runAuditGate({ audit: () => raw, log, error });
  return { code, log, error };
}

describe("production dependency audit gate", () => {
  it.each(["high", "critical"])("blocks transitive %s advisories with no upstream fix", (severity) => {
    const result = run(JSON.stringify(report(severity)));
    expect(result.code).toBe(1);
    expect(result.log).not.toHaveBeenCalled();
    expect(result.error).toHaveBeenCalledWith(expect.stringContaining("GHSA-example"));
  });

  it.each([true, false])("blocks fixable high advisories (direct: %s)", (direct) => {
    expect(run(JSON.stringify(report("high", direct, ">=2.0.0"))).code).toBe(1);
  });

  it("blocks a direct advisory with no upstream fix", () => {
    expect(run(JSON.stringify(report("high", true))).code).toBe(1);
  });

  it.each([undefined, "info", "low", "moderate"])("passes a valid report without high/critical findings (%s)", (severity) => {
    const result = run(JSON.stringify(report(severity)));
    expect(result.code).toBe(0);
    expect(result.error).not.toHaveBeenCalled();
  });

  it.each(["", "not json", "ERR_PNPM_AUDIT_BAD_RESPONSE: audit endpoint unavailable", "{}", "null"])("fails closed on an invalid report: %j", (raw) => {
    const result = run(raw);
    expect(result.code).toBe(1);
    expect(result.log).not.toHaveBeenCalled();
  });

  it("fails closed when the audit command cannot run", () => {
    const log = vi.fn();
    const error = vi.fn();
    expect(runAuditGate({ audit: () => { throw new Error("network unavailable"); }, log, error })).toBe(1);
    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it("blocks a high finding reported only in the summary", () => {
    const data = report();
    data.metadata.vulnerabilities.high = 1;
    expect(run(JSON.stringify(data)).code).toBe(1);
  });

  it("blocks a high finding even when the summary incorrectly says zero", () => {
    const data = report("high");
    data.metadata.vulnerabilities.high = 0;
    expect(run(JSON.stringify(data)).code).toBe(1);
  });

  it("rejects an unknown severity", () => {
    expect(run(JSON.stringify(report("unrecognized"))).code).toBe(1);
  });
});
