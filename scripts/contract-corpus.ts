/**
 * pnpm contracts:corpus — compile real S/4HANA Cloud service descriptions
 * from the SAP Business Accelerator Hub sandbox (api.sap.com) and measure them
 * (P1.3).
 *
 * WHAT IT PROVES. The golden tests run on descriptions written for this
 * repository. This runs the same compiler, slicer and OpenAPI generator over
 * 20 or more of SAP's own published descriptions, and fails when one does not
 * compile, when fewer than CONTRACT_CORPUS_MIN compile, or when a generated
 * document does not validate against the OpenAPI 3.1 or 3.0.3 specification.
 * It also measures PersonalData annotation coverage — the input P1.5 needs.
 *
 * WHAT IT NEVER DOES (roadmap §9.1 #17: SAP's $metadata is not bundled — its
 * redistribution rights are unverified). Each description is fetched into
 * memory, compiled, measured and dropped. Nothing is written to disk, cached,
 * uploaded as an artefact or logged: the output is the API id (a public name)
 * and counts. A failure names the HTTP status or the compiler's refusal code,
 * never the body.
 *
 * THE SECRET. SAP_API_HUB_SANDBOX_API_KEY — the API key api.sap.com shows a
 * signed-in user (Settings → Show API Key). Without it this exits 0 and says
 * it skipped; the CI job does not run it at all (.github/workflows/contract-corpus.yml).
 *
 *   CONTRACT_CORPUS_APIS   comma-separated API ids, replacing the list below
 *   CONTRACT_CORPUS_MIN    how many must compile (default 20)
 */

import { appendFileSync } from "fs";

import { addCoverage, EMPTY_COVERAGE } from "@/lib/contracts/personal-data";

import { evaluateDescription, type DescriptionReport } from "./lib/contract-corpus";

const SANDBOX_ROOT = "https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap";

/**
 * S/4HANA Cloud OData V2 APIs published on the Hub sandbox. Their path is the
 * reliable V2 rule (/sap/opu/odata/sap/<API_ID>, hub-content.ts). More than
 * the minimum, so one SAP retires does not fail the job; the run lists which
 * answered.
 */
const DEFAULT_APIS: readonly string[] = [
  "API_BUSINESS_PARTNER",
  "API_SALES_ORDER_SRV",
  "API_PURCHASEORDER_PROCESS_SRV",
  "API_PRODUCT_SRV",
  "API_MATERIAL_DOCUMENT_SRV",
  "API_BILLING_DOCUMENT_SRV",
  "API_SUPPLIERINVOICE_PROCESS_SRV",
  "API_SALES_QUOTATION_SRV",
  "API_SALES_CONTRACT_SRV",
  "API_CUSTOMER_RETURN_SRV",
  "API_PURCHASEREQ_PROCESS_SRV",
  "API_PURCHASECONTRACT_PROCESS_SRV",
  "API_COSTCENTER_SRV",
  "API_GLACCOUNTINCHARTOFACCOUNTS_SRV",
  "API_JOURNALENTRYITEMBASIC_SRV",
  "API_MATERIAL_STOCK_SRV",
  "API_PRODUCTION_ORDER_2_SRV",
  "API_BANKDETAIL_SRV",
  "API_COMPANYCODE_SRV",
  "API_CREDIT_MEMO_REQUEST_SRV",
  "API_DEBIT_MEMO_REQUEST_SRV",
  "API_SALES_ORDER_SIMULATION_SRV",
  "API_PRODUCT_AVAILY_INFO_BASIC",
  "API_CV_ATTACHMENT_SRV",
  "API_PHYSICAL_INVENTORY_DOC_SRV",
  "API_OPLACCTGDOCITEMCUBE_SRV",
  "API_MAINTNOTIFICATION",
  "API_EQUIPMENT",
];

const TIMEOUT_MS = 30_000;
const DELAY_MS = 500;

async function fetchDescription(apiId: string, key: string): Promise<{ ok: true; text: string } | { ok: false; status: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${SANDBOX_ROOT}/${encodeURIComponent(apiId)}/$metadata`, {
      headers: { APIKey: key, Accept: "application/xml" },
      signal: controller.signal,
    });
    if (!res.ok) {
      await res.body?.cancel();
      return { ok: false, status: `HTTP ${res.status}` };
    }
    return { ok: true, text: await res.text() };
  } catch (err) {
    return { ok: false, status: err instanceof Error && err.name === "AbortError" ? "TIMEOUT" : "FETCH_FAILED" };
  } finally {
    clearTimeout(timer);
  }
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`;
}

async function main(): Promise<number> {
  const key = process.env.SAP_API_HUB_SANDBOX_API_KEY ?? "";
  if (key === "") {
    console.log("contracts:corpus skipped: SAP_API_HUB_SANDBOX_API_KEY is not set.");
    return 0;
  }
  const apis = (process.env.CONTRACT_CORPUS_APIS || DEFAULT_APIS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const min = Number.parseInt(process.env.CONTRACT_CORPUS_MIN ?? "20", 10);

  const rows: { api: string; fetched: string; report: DescriptionReport | null }[] = [];
  for (const api of apis) {
    const got = await fetchDescription(api, key);
    if (!got.ok) {
      rows.push({ api, fetched: got.status, report: null });
    } else {
      // The text goes out of scope at the end of this block: in memory only.
      rows.push({ api, fetched: "200", report: evaluateDescription(got.text) });
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const compiled = rows.filter((r) => r.report?.compiled);
  const refused = rows.filter((r) => r.report && !r.report.compiled);
  const invalidDocs = rows.reduce((n, r) => n + (r.report?.documentsInvalid ?? 0), 0);
  const coverage = compiled.reduce((c, r) => addCoverage(c, r.report!.coverage!), EMPTY_COVERAGE);

  const lines: string[] = [];
  lines.push("| API | fetched | compiled | OData | entity sets | documents valid | properties | PersonalData-annotated | vCard personal | ms |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const rep = r.report;
    lines.push(
      `| ${r.api} | ${r.fetched} | ${rep ? (rep.compiled ? "yes" : `no (${rep.refusal})`) : "-"} | ${rep?.odataVersion ?? "-"} | ${rep?.entitySets ?? "-"} | ${
        rep ? `${rep.documentsValid}/${rep.documentsValid + rep.documentsInvalid}` : "-"
      } | ${rep?.coverage?.properties ?? "-"} | ${rep?.coverage?.annotatedProperties ?? "-"} | ${rep?.coverage?.personalSemantics ?? "-"} | ${rep?.compileMs ?? "-"} |`,
    );
  }
  lines.push("");
  lines.push(`Compiled: ${compiled.length} of ${rows.length} requested (minimum ${min}).`);
  lines.push(
    `PersonalData coverage over ${coverage.properties} properties of ${coverage.entityTypes} entity types: ` +
      `${coverage.annotatedProperties} annotated (${pct(coverage.annotatedProperties, coverage.properties)}) — ` +
      `IsPotentiallyPersonal ${coverage.potentiallyPersonal}, IsPotentiallySensitive ${coverage.potentiallySensitive}, ` +
      `FieldSemantics ${coverage.withFieldSemantics}; EntitySemantics on ${coverage.entityTypesWithSemantics} entity types ` +
      `(${pct(coverage.entityTypesWithSemantics, coverage.entityTypes)}); V2 sap:semantics naming a person on ${coverage.personalSemantics} properties.`,
  );
  const report = lines.join("\n");
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Contract corpus\n\n${report}\n`);

  let failed = false;
  if (compiled.length < min) {
    console.error(`\nFewer than ${min} descriptions compiled.`);
    failed = true;
  }
  if (refused.length > 0) {
    console.error(`\n${refused.length} description(s) SAP published were refused by the compiler: ${refused.map((r) => r.api).join(", ")}.`);
    failed = true;
  }
  if (invalidDocs > 0) {
    console.error(`\n${invalidDocs} generated document(s) did not validate against the OpenAPI specification.`);
    failed = true;
  }
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error("contracts:corpus failed:", err instanceof Error ? err.name : "unknown error");
    process.exit(1);
  },
);
