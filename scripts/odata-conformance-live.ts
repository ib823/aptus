/**
 * pnpm tsx scripts/odata-conformance-live.ts — tier 2 of the query surface's
 * conformance (P1.4, 3.21 item 7): the URLs CoreEdge builds, sent to SAP's
 * own services on the SAP Business Accelerator Hub sandbox, reduced to
 * verdicts and compared with what tier 1 asserts of the same cases.
 *
 * WHAT IT PROVES. Tier 1 (tests/conformance/odata-query/, every PR) replays
 * answers written for this repository. This asks real SAP stacks: whether a
 * doubled quote is honoured inside a literal, whether $top and $skip are kept
 * to, whether $select is, and what the count and the envelope look like on
 * each version. A4 is met once a tier-2 (or a tier-3 lab) run agrees with
 * tier 1 (decision D17). See docs/runbooks/coreedge-query-surface.md.
 *
 * WHAT IT NEVER DOES. It stores verdicts only (statuses, booleans and the
 * protocol's envelope key names): no row, no value and no description is
 * written, logged or uploaded (scripts/lib/odata-conformance-live.ts).
 *
 * THE SECRET. SAP_API_HUB_SANDBOX_API_KEY, the key P1.3's corpus job uses.
 * Without it this exits 0 and says it skipped.
 *
 *   ODATA_LIVE_BASE_URL   the sandbox root (default https://sandbox.api.sap.com/s4hanacloud)
 *   ODATA_LIVE_TARGETS    JSON [{ name, odata, servicePath, entitySet }], replacing the
 *                         defaults; the V4 target's path on the sandbox is [unverified],
 *                         so it is configured in the workflow rather than assumed here
 *   ODATA_LIVE_VERDICTS   a file to write the verdicts to, as JSON (the workflow's summary)
 */

import { appendFileSync, writeFileSync } from "node:fs";

import { runTarget, type LiveTarget, type Verdict } from "./lib/odata-conformance-live";

const DEFAULT_TARGETS: readonly LiveTarget[] = [
  { name: "API_BUSINESS_PARTNER", odata: "V2", servicePath: "/sap/opu/odata/sap/API_BUSINESS_PARTNER", entitySet: "A_BusinessPartner" },
  { name: "API_SALES_ORDER_SRV", odata: "V2", servicePath: "/sap/opu/odata/sap/API_SALES_ORDER_SRV", entitySet: "A_SalesOrder" },
];

function targets(): readonly LiveTarget[] {
  const raw = process.env.ODATA_LIVE_TARGETS?.trim();
  if (!raw) return DEFAULT_TARGETS;
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("ODATA_LIVE_TARGETS must be a JSON array.");
  return parsed.map((t: unknown) => {
    const o = t as Partial<LiveTarget>;
    if (typeof o.name !== "string" || (o.odata !== "V2" && o.odata !== "V4") || typeof o.servicePath !== "string" || typeof o.entitySet !== "string") {
      throw new Error("Each ODATA_LIVE_TARGETS entry is { name, odata: V2 | V4, servicePath, entitySet }.");
    }
    return { name: o.name, odata: o.odata, servicePath: o.servicePath, entitySet: o.entitySet };
  });
}

function summary(verdicts: readonly Verdict[]): string {
  const rows = verdicts.map((v) => `| ${v.target} | ${v.case} | ${v.status ?? "—"} | ${v.agrees ? "agrees" : `DIFFERS: ${v.expected ?? ""}`} |`);
  return ["| Target | Case | Status | Against tier 1 |", "|---|---|---|---|", ...rows].join("\n");
}

async function main(): Promise<void> {
  const key = process.env.SAP_API_HUB_SANDBOX_API_KEY;
  if (!key) {
    console.log("SAP_API_HUB_SANDBOX_API_KEY is not set; tier-2 conformance is skipped.");
    return;
  }
  const baseUrl = process.env.ODATA_LIVE_BASE_URL?.trim() || "https://sandbox.api.sap.com/s4hanacloud";
  const verdicts: Verdict[] = [];
  for (const target of targets()) {
    try {
      verdicts.push(...(await runTarget(target, { fetch, baseUrl, headers: { APIKey: key } })));
    } catch (err) {
      // A fault of the run (a description that does not compile), said by its message, never SAP's body.
      verdicts.push({
        target: target.name,
        case: "RUN",
        status: null,
        envelopeKeys: [],
        countType: null,
        nextLink: null,
        rowsWithinTop: null,
        noRowRepeated: null,
        onlySelected: null,
        quoteHonoured: null,
        agrees: false,
        expected: err instanceof Error ? err.message : "the run failed",
      });
    }
  }
  const text = summary(verdicts);
  console.log(text);
  const file = process.env.ODATA_LIVE_VERDICTS?.trim();
  if (file) writeFileSync(file, `${JSON.stringify({ ranAt: new Date().toISOString(), verdicts }, null, 2)}\n`, "utf8");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Query surface, tier 2\n\n${text}\n`);
  if (verdicts.some((v) => !v.agrees)) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
