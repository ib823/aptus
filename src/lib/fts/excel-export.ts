/**
 * Fit-to-Standard Workbench — Excel team backlog export
 *
 * Client-side Excel generation using exceljs, loaded lazily to keep the
 * initial page payload small. Produces a three-tab workbook (Summary,
 * Configure Backlog, Custom RICEFW Backlog) that maps cleanly to Cloud ALM
 * Requirements.
 *
 * Uses the repo's existing exceljs dependency rather than xlsx — npm's xlsx
 * is stuck at 0.18.5 with two open CVEs (GHSA-4r6h-8v6p-xvw6 prototype
 * pollution, GHSA-5pgg-2g8v-p4x9 ReDoS); exceljs has no current CVEs.
 */

import type {
  ConfigBacklogRow,
  CustomBacklogRow,
  Decision,
  DecisionState,
  ScopeItemContent,
} from "./types";

export interface ExportOptions {
  scope: ScopeItemContent;
  choices: Record<string, DecisionState>;
  clientName: string;
}

/**
 * Build and trigger download of the team backlog xlsx for the given scope +
 * choices. Returns the suggested filename.
 *
 * exceljs is loaded via dynamic import so the main bundle stays small.
 */
export async function exportTeamBacklog({
  scope,
  choices,
  clientName,
}: ExportOptions): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const dateStr = new Date().toISOString().slice(0, 10);

  const cfgDecisions = scope.decisions.filter(
    (d) => choices[d.id]?.choice === "cfg",
  );
  const cstDecisions = scope.decisions.filter(
    (d) => choices[d.id]?.choice === "cst",
  );
  const stdCount = scope.decisions.filter(
    (d) => choices[d.id]?.choice === "std",
  ).length;
  const openCount =
    scope.decisions.length -
    Object.values(choices).filter((c) => c.choice && c.choice !== "open")
      .length;
  const totalCustomEffort = cstDecisions.reduce((s, d) => s + d.effort, 0);

  // === Sheet 1: Configure Backlog ===
  const configRows: ConfigBacklogRow[] = cfgDecisions.map((d, i) => ({
    "Backlog ID": `CFG-${scope.code}-${String(i + 1).padStart(3, "0")}`,
    "Scope Item": scope.code,
    "Scope Item Name": scope.title,
    "Decision #": d.id,
    "Decision Title": d.title,
    "SSCUI ID": d.sscui_id,
    "SSCUI Name": d.sscui_name,
    "Client Intent (from workbench notes)":
      choices[d.id]?.notes || "(no notes captured — review with client in workshop)",
    "Effort (days)": "Included",
    Status: "Ready for Explore",
    Assignee: "",
    "Target Sprint / Wave": "",
    "Cloud ALM Req ID": "",
    Source: "Fit-to-Standard Workbench (pre-onboarding)",
  }));
  if (configRows.length === 0) {
    configRows.push({
      "Backlog ID": "(none)",
      "Scope Item": scope.code,
      "Scope Item Name": scope.title,
      "Decision #": "",
      "Decision Title":
        "No Configure decisions selected — pure standard adoption",
      "SSCUI ID": "",
      "SSCUI Name": "",
      "Client Intent (from workbench notes)": "",
      "Effort (days)": "0",
      Status: "",
      Assignee: "",
      "Target Sprint / Wave": "",
      "Cloud ALM Req ID": "",
      Source: "",
    });
  }

  // === Sheet 2: Custom RICEFW Backlog ===
  const customRows: CustomBacklogRow[] = cstDecisions.map((d, i) => ({
    "RICEFW ID": `RFW-${scope.code}-${String(i + 1).padStart(3, "0")}`,
    "Scope Item": scope.code,
    "Decision #": d.id,
    Title: `${d.title} (custom)`,
    "RICEFW Class": d.ricefw_class,
    "Business Justification (from workbench notes)":
      choices[d.id]?.notes || "(no notes captured — must be filled before build)",
    "Extensibility Approach": d.custom_type,
    "Upgrade Impact Risk": d.ext_impact,
    "Estimated Effort (days)": d.effort,
    "Client Approved": "YES (signed at Fit-to-Standard pre-onboarding)",
    Status: "Ready for Explore — Build",
    Assignee: "",
    "Target Sprint / Wave": "",
    "Regression Test Required": d.ext_impact.includes("High")
      ? "YES — every release"
      : "YES — annual",
    Source: "Fit-to-Standard Workbench (pre-onboarding)",
  }));
  if (customRows.length === 0) {
    customRows.push({
      "RICEFW ID": "(none)",
      "Scope Item": scope.code,
      "Decision #": "",
      Title: "No custom development required — full standard adoption",
      "RICEFW Class": "",
      "Business Justification (from workbench notes)": "",
      "Extensibility Approach": "",
      "Upgrade Impact Risk": "",
      "Estimated Effort (days)": 0,
      "Client Approved": "",
      Status: "",
      Assignee: "",
      "Target Sprint / Wave": "",
      "Regression Test Required": "",
      Source: "",
    });
  }

  // === Sheet 3: Summary ===
  const summaryRows: Array<{ Field: string; Value: string | number }> = [
    { Field: "Client", Value: clientName || "(not provided)" },
    { Field: "Scope Item", Value: `${scope.code} — ${scope.title}` },
    { Field: "Release", Value: scope.release },
    { Field: "Workbench Date", Value: dateStr },
    { Field: "", Value: "" },
    { Field: "Decisions: Standard", Value: stdCount },
    { Field: "Decisions: Configure (SSCUI)", Value: cfgDecisions.length },
    { Field: "Decisions: Custom (RICEFW)", Value: cstDecisions.length },
    { Field: "Decisions: Open", Value: openCount },
    { Field: "", Value: "" },
    { Field: "Total Custom Effort (days)", Value: totalCustomEffort },
    { Field: "", Value: "" },
    {
      Field: "Handoff Instructions",
      Value:
        "Configure Backlog → Config Consultant on Day 1 of Explore. " +
        "Custom RICEFW Backlog → Tech Lead for sprint planning. " +
        "Both load into Cloud ALM Requirements.",
    },
  ];

  const wb = new ExcelJS.Workbook();

  const wsSummary = wb.addWorksheet("Summary");
  wsSummary.columns = [
    { header: "Field", key: "Field", width: 32 },
    { header: "Value", key: "Value", width: 80 },
  ];
  wsSummary.addRows(summaryRows);

  const configKeys = Object.keys(configRows[0] ?? {});
  const wsConfig = wb.addWorksheet("Configure Backlog");
  wsConfig.columns = configKeys.map((k) => ({ header: k, key: k, width: 22 }));
  wsConfig.addRows(configRows);

  const customKeys = Object.keys(customRows[0] ?? {});
  const wsCustom = wb.addWorksheet("Custom RICEFW Backlog");
  wsCustom.columns = customKeys.map((k) => ({ header: k, key: k, width: 22 }));
  wsCustom.addRows(customRows);

  const safeClient =
    (clientName || "CLIENT").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 24) ||
    "CLIENT";
  const filename = `${safeClient}_${scope.code}_ExploreBacklog_${dateStr}.xlsx`;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  return filename;
}

/**
 * Build a JSON baseline export — minimal alternative to the Excel for
 * machine-readable audit trails or downstream integrations.
 */
export function buildBaselineJson({
  scope,
  choices,
  clientName,
}: ExportOptions): string {
  const out = {
    scopeItem: `${scope.code} — ${scope.title}`,
    release: scope.release,
    client: clientName,
    date: new Date().toISOString().slice(0, 10),
    decisions: scope.decisions.map((d: Decision) => ({
      id: d.id,
      title: d.title,
      sscui: d.sscui,
      choice: choices[d.id]?.choice || "open",
      extraEffortDays: choices[d.id]?.effort || 0,
      notes: choices[d.id]?.notes || "",
    })),
    totalExtraEffortDays: Object.values(choices).reduce(
      (s, c) => s + (c.effort || 0),
      0,
    ),
  };
  return JSON.stringify(out, null, 2);
}

/** Trigger download of a Blob with the given filename. */
export function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
