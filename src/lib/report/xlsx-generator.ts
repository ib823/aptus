/** XLSX report generation using ExcelJS — applies the v1.2 design system:
 *
 *   - Aptus brand-color frozen header (#0B0B0F, white text, bold) — locked
 *     per spec §5.7, never inherits client-accent override
 *   - Zebra row banding at #FAFAFA (alternate rows)
 *   - Auto-filter on header row
 *   - Frozen header row on scroll
 *   - Optional per-cell styling via SheetConfig.styleRow hook (used for
 *     outcome conditional tinting and must-have row left-border accent
 *     per spec §4.5–§4.15) */

import ExcelJS from "exceljs";
import { APTUS_BRAND } from "@/lib/report/branding";
import {
  DOT_TINT_HEX,
  type DotTier,
  outcomeLabel,
} from "@/lib/report/glossary";
import type { ResolutionType } from "@/types/assessment";

interface SheetConfig {
  name: string;
  columns: Array<{ header: string; key: string; width: number }>;
  rows: Array<Record<string, unknown>>;
  /** Optional per-row style hook. Receives the (1-indexed) row number + the
   * source row data. Apply cell styling via `row.getCell(n).fill = {...}`.
   * Called after the row has been added but before workbook.write. */
  styleRow?: (row: ExcelJS.Row, source: Record<string, unknown>, rowIndex: number) => void;
}

/** Hex (#RRGGBB) → ExcelJS ARGB ("FFRRGGBB") format. */
function argb(hex: string): string {
  return "FF" + hex.replace(/^#/, "").toUpperCase();
}

const APTUS_BRAND_ARGB = argb(APTUS_BRAND);
const ZEBRA_ARGB = argb("#FAFAFA");

export async function generateXlsx(sheets: SheetConfig[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Aptus";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    ws.columns = sheet.columns;

    // Header — Aptus brand fill (locked per spec §5.7)
    const headerRow = ws.getRow(1);
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: APTUS_BRAND_ARGB },
    };
    headerRow.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    headerRow.alignment = { vertical: "middle" };
    headerRow.height = 28;

    // Body rows + zebra banding + per-row style hook
    sheet.rows.forEach((srcRow, idx) => {
      const wsRow = ws.addRow(srcRow);
      // Zebra striping — every other body row
      if (idx % 2 === 1) {
        wsRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: ZEBRA_ARGB },
          };
        });
      }
      // Per-sheet conditional formatting hook
      if (sheet.styleRow) {
        sheet.styleRow(wsRow, srcRow, idx + 2); // +2: 1 for header, 1 for 1-index
      }
    });

    // Auto-filter on the data range
    if (sheet.rows.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: sheet.rows.length + 1, column: sheet.columns.length },
      };
    }

    // Freeze header row on scroll
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/** Tint a single cell with the dot-tier light background. */
export function tintCell(cell: ExcelJS.Cell, tier: DotTier): void {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: argb(DOT_TINT_HEX[tier]) },
  };
}

/** Apply the must-have left-border accent (red) to a row's first cell. */
export function markMustHave(row: ExcelJS.Row): void {
  const firstCell = row.getCell(1);
  firstCell.border = {
    ...firstCell.border,
    left: { style: "medium", color: { argb: argb("#B91C1C") } },
  };
}

export function scopeCatalogSheet(data: Array<Record<string, unknown>>): SheetConfig {
  return {
    name: "Scope Catalog",
    columns: [
      { header: "Scope Item ID", key: "scopeItemId", width: 15 },
      { header: "Name", key: "name", width: 35 },
      { header: "Functional Area", key: "functionalArea", width: 20 },
      { header: "Sub Area", key: "subArea", width: 20 },
      { header: "Selected", key: "selected", width: 10 },
      { header: "Relevance", key: "relevance", width: 12 },
      { header: "Granularity", key: "granularity", width: 13 },
      { header: "Verdict", key: "verdict", width: 22 },
      { header: "Current State", key: "currentState", width: 15 },
      { header: "Notes", key: "notes", width: 40 },
      { header: "Total Steps", key: "totalSteps", width: 12 },
      { header: "Config Count", key: "configCount", width: 12 },
    ],
    rows: data,
  };
}

export function stepDetailSheet(data: Array<Record<string, unknown>>): SheetConfig {
  return {
    name: "Step Detail",
    columns: [
      { header: "Scope Item ID", key: "scopeItemId", width: 15 },
      { header: "Scope Item Name", key: "scopeItemName", width: 30 },
      { header: "Process Flow", key: "processFlow", width: 30 },
      { header: "Step Sequence", key: "stepSequence", width: 14 },
      { header: "Action Title", key: "actionTitle", width: 40 },
      { header: "Step Type", key: "stepType", width: 15 },
      { header: "Fit Status", key: "fitStatus", width: 12 },
      { header: "Client Note", key: "clientNote", width: 40 },
      { header: "Current Process", key: "currentProcess", width: 40 },
      { header: "Respondent", key: "respondent", width: 25 },
      { header: "Responded At", key: "respondedAt", width: 20 },
    ],
    rows: data,
  };
}

export function gapRegisterSheet(data: Array<Record<string, unknown>>): SheetConfig {
  return {
    name: "Gap Register",
    columns: [
      { header: "Gap ID", key: "gapId", width: 25 },
      { header: "Scope Item", key: "scopeItem", width: 15 },
      { header: "Process Step", key: "processStep", width: 25 },
      { header: "Gap Description", key: "gapDescription", width: 40 },
      { header: "Resolution Type", key: "resolutionType", width: 18 },
      { header: "Resolution Description", key: "resolutionDescription", width: 40 },
      { header: "Effort Days", key: "effortDays", width: 12 },
      { header: "One-time Cost", key: "oneTimeCost", width: 14 },
      { header: "Recurring Cost", key: "recurringCost", width: 14 },
      { header: "Risk Level", key: "riskLevel", width: 12 },
      { header: "Upgrade Impact", key: "upgradeImpact", width: 30 },
      { header: "Decided By", key: "decidedBy", width: 25 },
      { header: "Decided At", key: "decidedAt", width: 20 },
      { header: "Client Approved", key: "clientApproved", width: 15 },
      { header: "Rationale", key: "rationale", width: 40 },
    ],
    rows: data,
  };
}

export function configWorkbookSheet(data: Array<Record<string, unknown>>): SheetConfig {
  return {
    name: "Config Workbook",
    columns: [
      { header: "Scope Item ID", key: "scopeItemId", width: 15 },
      { header: "Scope Item Name", key: "scopeItemName", width: 30 },
      { header: "Application Area", key: "applicationArea", width: 20 },
      { header: "Application Sub Area", key: "applicationSubarea", width: 20 },
      { header: "Config Item Name", key: "configItemName", width: 35 },
      { header: "Config Item ID", key: "configItemId", width: 18 },
      { header: "Activity Description", key: "activityDescription", width: 40 },
      { header: "Self Service", key: "selfService", width: 12 },
      { header: "Config Approach", key: "configApproach", width: 30 },
      { header: "Category", key: "category", width: 14 },
      { header: "Activity ID", key: "activityId", width: 18 },
      { header: "Included", key: "included", width: 10 },
    ],
    rows: data,
  };
}

export function auditTrailSheet(data: Array<Record<string, unknown>>): SheetConfig {
  return {
    name: "Audit Trail",
    columns: [
      { header: "Timestamp", key: "timestamp", width: 22 },
      { header: "Actor", key: "actor", width: 25 },
      { header: "Actor Role", key: "actorRole", width: 15 },
      { header: "Entity Type", key: "entityType", width: 15 },
      { header: "Entity ID", key: "entityId", width: 25 },
      { header: "Action", key: "action", width: 22 },
      { header: "Old Value", key: "oldValue", width: 30 },
      { header: "New Value", key: "newValue", width: 30 },
      { header: "Reason", key: "reason", width: 40 },
    ],
    rows: data,
  };
}

export function integrationRegisterSheets(data: Array<Record<string, unknown>>): SheetConfig[] {
  // Sheet 1: Summary — grouped by direction with counts and total effort
  const byDirection: Record<string, { count: number; effort: number }> = {};
  for (const row of data) {
    const dir = String(row.direction ?? "Unknown");
    const entry = byDirection[dir] ?? { count: 0, effort: 0 };
    entry.count++;
    entry.effort += Number(row.effortDays ?? 0);
    byDirection[dir] = entry;
  }
  const summaryRows = Object.entries(byDirection).map(([direction, v]) => ({
    direction,
    count: v.count,
    totalEffortDays: v.effort,
  }));
  summaryRows.push({ direction: "TOTAL", count: data.length, totalEffortDays: data.reduce((s, r) => s + Number(r.effortDays ?? 0), 0) });

  // Sheet 2: Detail — full listing (existing content)
  // Sheet 3: By Source System — pivot by sourceSystem
  const bySource: Record<string, { count: number; effort: number; directions: Set<string> }> = {};
  for (const row of data) {
    const src = String(row.sourceSystem ?? "Unknown");
    const entry = bySource[src] ?? { count: 0, effort: 0, directions: new Set<string>() };
    entry.count++;
    entry.effort += Number(row.effortDays ?? 0);
    entry.directions.add(String(row.direction ?? ""));
    bySource[src] = entry;
  }
  const bySourceRows = Object.entries(bySource).map(([sourceSystem, v]) => ({
    sourceSystem,
    integrationCount: v.count,
    totalEffortDays: v.effort,
    directions: [...v.directions].join(", "),
  }));

  return [
    {
      name: "Summary",
      columns: [
        { header: "Direction", key: "direction", width: 20 },
        { header: "Integration Count", key: "count", width: 18 },
        { header: "Total Effort Days", key: "totalEffortDays", width: 18 },
      ],
      rows: summaryRows,
    },
    {
      name: "Detail",
      columns: [
        { header: "Integration ID", key: "integrationId", width: 25 },
        { header: "Name", key: "name", width: 30 },
        { header: "Description", key: "description", width: 40 },
        { header: "Direction", key: "direction", width: 15 },
        { header: "Source System", key: "sourceSystem", width: 20 },
        { header: "Target System", key: "targetSystem", width: 20 },
        { header: "Interface Type", key: "interfaceType", width: 14 },
        { header: "Frequency", key: "frequency", width: 16 },
        { header: "Middleware", key: "middleware", width: 18 },
        { header: "Complexity", key: "complexity", width: 12 },
        { header: "Priority", key: "priority", width: 10 },
        { header: "Status", key: "status", width: 12 },
        { header: "Effort Days", key: "effortDays", width: 12 },
        { header: "Functional Area", key: "functionalArea", width: 18 },
        { header: "Technical Notes", key: "technicalNotes", width: 40 },
      ],
      rows: data,
    },
    {
      name: "By Source System",
      columns: [
        { header: "Source System", key: "sourceSystem", width: 25 },
        { header: "Integration Count", key: "integrationCount", width: 18 },
        { header: "Total Effort Days", key: "totalEffortDays", width: 18 },
        { header: "Directions", key: "directions", width: 30 },
      ],
      rows: bySourceRows,
    },
  ];
}

export function dataMigrationRegisterSheets(data: Array<Record<string, unknown>>): SheetConfig[] {
  // Sheet 1: Summary — by object type
  const byType: Record<string, { count: number; effort: number; records: number }> = {};
  for (const row of data) {
    const t = String(row.objectType ?? "Unknown");
    const entry = byType[t] ?? { count: 0, effort: 0, records: 0 };
    entry.count++;
    entry.effort += Number(row.effortDays ?? 0);
    entry.records += Number(row.recordCount ?? 0);
    byType[t] = entry;
  }
  const summaryRows = Object.entries(byType).map(([objectType, v]) => ({
    objectType,
    objectCount: v.count,
    totalRecords: v.records,
    totalEffortDays: v.effort,
  }));
  summaryRows.push({
    objectType: "TOTAL",
    objectCount: data.length,
    totalRecords: data.reduce((s, r) => s + Number(r.recordCount ?? 0), 0),
    totalEffortDays: data.reduce((s, r) => s + Number(r.effortDays ?? 0), 0),
  });

  // Sheet 3: By Source — pivot by sourceSystem
  const bySource: Record<string, { count: number; effort: number; records: number }> = {};
  for (const row of data) {
    const src = String(row.sourceSystem ?? "Unknown");
    const entry = bySource[src] ?? { count: 0, effort: 0, records: 0 };
    entry.count++;
    entry.effort += Number(row.effortDays ?? 0);
    entry.records += Number(row.recordCount ?? 0);
    bySource[src] = entry;
  }
  const bySourceRows = Object.entries(bySource).map(([sourceSystem, v]) => ({
    sourceSystem,
    objectCount: v.count,
    totalRecords: v.records,
    totalEffortDays: v.effort,
  }));

  // Sheet 4: Effort Breakdown — by mapping complexity and cleansing
  const byComplexity: Record<string, { count: number; effort: number; cleansingCount: number }> = {};
  for (const row of data) {
    const c = String(row.mappingComplexity || "Unclassified");
    const entry = byComplexity[c] ?? { count: 0, effort: 0, cleansingCount: 0 };
    entry.count++;
    entry.effort += Number(row.effortDays ?? 0);
    if (row.cleansingRequired === "Yes") entry.cleansingCount++;
    byComplexity[c] = entry;
  }
  const effortRows = Object.entries(byComplexity).map(([complexity, v]) => ({
    mappingComplexity: complexity,
    objectCount: v.count,
    cleansingRequired: v.cleansingCount,
    totalEffortDays: v.effort,
    avgEffortDays: v.count > 0 ? Math.round((v.effort / v.count) * 10) / 10 : 0,
  }));

  return [
    {
      name: "Summary",
      columns: [
        { header: "Object Type", key: "objectType", width: 22 },
        { header: "Object Count", key: "objectCount", width: 14 },
        { header: "Total Records", key: "totalRecords", width: 14 },
        { header: "Total Effort Days", key: "totalEffortDays", width: 18 },
      ],
      rows: summaryRows,
    },
    {
      name: "Detail",
      columns: [
        { header: "Object ID", key: "objectId", width: 25 },
        { header: "Object Name", key: "objectName", width: 30 },
        { header: "Description", key: "description", width: 40 },
        { header: "Object Type", key: "objectType", width: 18 },
        { header: "Source System", key: "sourceSystem", width: 20 },
        { header: "Source Format", key: "sourceFormat", width: 14 },
        { header: "Volume", key: "volumeEstimate", width: 12 },
        { header: "Record Count", key: "recordCount", width: 12 },
        { header: "Cleansing Required", key: "cleansingRequired", width: 16 },
        { header: "Mapping Complexity", key: "mappingComplexity", width: 16 },
        { header: "Migration Approach", key: "migrationApproach", width: 18 },
        { header: "Migration Tool", key: "migrationTool", width: 14 },
        { header: "Priority", key: "priority", width: 10 },
        { header: "Status", key: "status", width: 12 },
        { header: "Effort Days", key: "effortDays", width: 12 },
        { header: "Functional Area", key: "functionalArea", width: 18 },
      ],
      rows: data,
    },
    {
      name: "By Source System",
      columns: [
        { header: "Source System", key: "sourceSystem", width: 25 },
        { header: "Object Count", key: "objectCount", width: 14 },
        { header: "Total Records", key: "totalRecords", width: 14 },
        { header: "Total Effort Days", key: "totalEffortDays", width: 18 },
      ],
      rows: bySourceRows,
    },
    {
      name: "Effort Breakdown",
      columns: [
        { header: "Mapping Complexity", key: "mappingComplexity", width: 22 },
        { header: "Object Count", key: "objectCount", width: 14 },
        { header: "Cleansing Required", key: "cleansingRequired", width: 18 },
        { header: "Total Effort Days", key: "totalEffortDays", width: 18 },
        { header: "Avg Effort Days", key: "avgEffortDays", width: 16 },
      ],
      rows: effortRows,
    },
  ];
}

export function ocmReportSheets(data: Array<Record<string, unknown>>): SheetConfig[] {
  // Sheet 1: Summary — by severity
  const bySeverity: Record<string, { count: number; affectedUsers: number; trainingRequired: number }> = {};
  for (const row of data) {
    const sev = String(row.severity ?? "Unknown");
    const entry = bySeverity[sev] ?? { count: 0, affectedUsers: 0, trainingRequired: 0 };
    entry.count++;
    entry.affectedUsers += Number(row.affectedUsers ?? 0);
    if (row.trainingRequired === "Yes") entry.trainingRequired++;
    bySeverity[sev] = entry;
  }
  const summaryRows = Object.entries(bySeverity).map(([severity, v]) => ({
    severity,
    impactCount: v.count,
    totalAffectedUsers: v.affectedUsers,
    trainingRequired: v.trainingRequired,
  }));
  summaryRows.push({
    severity: "TOTAL",
    impactCount: data.length,
    totalAffectedUsers: data.reduce((s, r) => s + Number(r.affectedUsers ?? 0), 0),
    trainingRequired: data.filter((r) => r.trainingRequired === "Yes").length,
  });

  // Sheet 3: Training Plan — items requiring training
  const trainingRows = data
    .filter((r) => r.trainingRequired === "Yes")
    .map((r) => ({
      title: r.title,
      impactedRole: r.impactedRole,
      department: r.department,
      trainingType: r.trainingType,
      trainingDuration: r.trainingDuration,
      affectedUsers: r.affectedUsers,
      severity: r.severity,
      status: r.status,
    }));

  // Sheet 4: Communications Plan — mitigation strategies
  const commsRows = data
    .filter((r) => r.mitigationStrategy)
    .map((r) => ({
      title: r.title,
      impactedRole: r.impactedRole,
      department: r.department,
      changeType: r.changeType,
      resistanceRisk: r.resistanceRisk,
      mitigationStrategy: r.mitigationStrategy,
      affectedUsers: r.affectedUsers,
      priority: r.priority,
    }));

  return [
    {
      name: "Summary",
      columns: [
        { header: "Severity", key: "severity", width: 18 },
        { header: "Impact Count", key: "impactCount", width: 14 },
        { header: "Total Affected Users", key: "totalAffectedUsers", width: 20 },
        { header: "Training Required", key: "trainingRequired", width: 18 },
      ],
      rows: summaryRows,
    },
    {
      name: "Detail",
      columns: [
        { header: "Impact ID", key: "impactId", width: 25 },
        { header: "Title", key: "title", width: 30 },
        { header: "Impacted Role", key: "impactedRole", width: 20 },
        { header: "Department", key: "department", width: 18 },
        { header: "Functional Area", key: "functionalArea", width: 18 },
        { header: "Change Type", key: "changeType", width: 18 },
        { header: "Severity", key: "severity", width: 14 },
        { header: "Description", key: "description", width: 40 },
        { header: "Training Required", key: "trainingRequired", width: 14 },
        { header: "Training Type", key: "trainingType", width: 16 },
        { header: "Training Duration", key: "trainingDuration", width: 14 },
        { header: "Resistance Risk", key: "resistanceRisk", width: 14 },
        { header: "Readiness", key: "readinessScore", width: 10 },
        { header: "Mitigation Strategy", key: "mitigationStrategy", width: 40 },
        { header: "Affected Users", key: "affectedUsers", width: 14 },
        { header: "Priority", key: "priority", width: 10 },
        { header: "Status", key: "status", width: 12 },
      ],
      rows: data,
    },
    {
      name: "Training Plan",
      columns: [
        { header: "Title", key: "title", width: 30 },
        { header: "Impacted Role", key: "impactedRole", width: 20 },
        { header: "Department", key: "department", width: 18 },
        { header: "Training Type", key: "trainingType", width: 16 },
        { header: "Training Duration", key: "trainingDuration", width: 14 },
        { header: "Affected Users", key: "affectedUsers", width: 14 },
        { header: "Severity", key: "severity", width: 14 },
        { header: "Status", key: "status", width: 12 },
      ],
      rows: trainingRows,
    },
    {
      name: "Communications Plan",
      columns: [
        { header: "Title", key: "title", width: 30 },
        { header: "Impacted Role", key: "impactedRole", width: 20 },
        { header: "Department", key: "department", width: 18 },
        { header: "Change Type", key: "changeType", width: 18 },
        { header: "Resistance Risk", key: "resistanceRisk", width: 14 },
        { header: "Mitigation Strategy", key: "mitigationStrategy", width: 40 },
        { header: "Affected Users", key: "affectedUsers", width: 14 },
        { header: "Priority", key: "priority", width: 10 },
      ],
      rows: commsRows,
    },
  ];
}

export function remainingItemsSheet(data: Array<Record<string, unknown>>): SheetConfig {
  return {
    name: "Remaining Items",
    columns: [
      { header: "Item #", key: "itemNumber", width: 10 },
      { header: "Category", key: "category", width: 25 },
      { header: "Title", key: "title", width: 35 },
      { header: "Description", key: "description", width: 50 },
      { header: "Severity", key: "severity", width: 12 },
      { header: "Source Entity", key: "sourceEntity", width: 20 },
      { header: "Scope Item", key: "scopeItemId", width: 15 },
      { header: "Functional Area", key: "functionalArea", width: 20 },
      { header: "Assigned To", key: "assignedTo", width: 25 },
      { header: "Resolution", key: "resolution", width: 40 },
      { header: "Resolved At", key: "resolvedAt", width: 20 },
      { header: "Resolved By", key: "resolvedBy", width: 25 },
      { header: "Auto-Generated", key: "autoGenerated", width: 15 },
    ],
    rows: data,
  };
}

// ── NEW: Requirements Traceability Matrix (spec §4.5) ────────────────────────

export interface TraceabilityRow {
  reqId: string;
  sourceFile: string;
  sourceRow: number;
  functionalArea: string;
  subArea: string;
  process: string;
  mustHave: boolean;
  yourAsk: string;
  /** Original ResolutionType — translated to plain label at render time */
  outcome: ResolutionType;
  /** "What it means for you" sentence */
  whatItMeans: string;
  effortDays: number;
  owner: string;
  notes: string;
}

const RT_TIER: Record<ResolutionType, DotTier> = {
  FIT: "success",
  CONFIGURE: "warning",
  ADAPT_PROCESS: "warning",
  ISV: "info",
  KEY_USER_EXT: "info",
  BTP_EXT: "info",
  CUSTOM_ABAP: "danger",
  OUT_OF_SCOPE: "neutral",
};

/** The Traceability Matrix sheet — 13 columns, must-have left-border accent,
 * Outcome column conditional tinting (light tier color). The 'Outcome' column
 * is the 9th (1-indexed). */
export function requirementsTraceabilitySheet(data: TraceabilityRow[]): SheetConfig {
  const rows = data.map((d) => ({
    reqId: d.reqId,
    sourceFile: d.sourceFile,
    sourceRow: d.sourceRow,
    functionalArea: d.functionalArea,
    subArea: d.subArea,
    process: d.process,
    mustHave: d.mustHave ? "Must-have" : "Nice-to-have",
    yourAsk: d.yourAsk,
    outcome: outcomeLabel(d.outcome),
    whatItMeans: d.whatItMeans,
    effortDays: d.effortDays,
    owner: d.owner,
    notes: d.notes,
  }));

  return {
    name: "Requirements",
    columns: [
      { header: "Req ID",          key: "reqId",          width: 14 },
      { header: "Source File",     key: "sourceFile",     width: 22 },
      { header: "Source Row",      key: "sourceRow",      width: 12 },
      { header: "Functional Area", key: "functionalArea", width: 22 },
      { header: "Sub-area",        key: "subArea",        width: 22 },
      { header: "Process",         key: "process",        width: 28 },
      { header: "Must-have",       key: "mustHave",       width: 14 },
      { header: "Your Ask",        key: "yourAsk",        width: 60 },
      { header: "Outcome",         key: "outcome",        width: 22 },
      { header: "What it means",   key: "whatItMeans",    width: 60 },
      { header: "Days",            key: "effortDays",     width: 8 },
      { header: "Owner",           key: "owner",          width: 18 },
      { header: "Notes",           key: "notes",          width: 38 },
    ],
    rows,
    styleRow(row, srcRow) {
      // Tint the Outcome cell (column 9) with the tier's light background
      const outcomeRaw = (srcRow as { outcome: string }).outcome;
      // srcRow.outcome is the plain label here; map back via the original data
      // (we stored both, but for simplicity use the visible label)
      const tier = labelToTier(outcomeRaw);
      if (tier) tintCell(row.getCell(9), tier);
      // Must-have row gets red left-border accent on the first cell
      if ((srcRow as { mustHave: string }).mustHave === "Must-have") {
        markMustHave(row);
      }
    },
  };
}

/** Reverse-lookup from plain label back to the dot tier. Tight coupling to
 * outcomeLabel() output — if labels are renamed in glossary.ts, the unit
 * test for traceability will catch the drift. */
function labelToTier(label: string): DotTier | null {
  // Iterate the canonical map rather than hand-coding strings
  for (const rt of Object.keys(RT_TIER) as ResolutionType[]) {
    if (outcomeLabel(rt) === label) return RT_TIER[rt];
  }
  return null;
}

// ── SAP Best-Practice Classification (independent verdict per 2602) ──────
//
// Multi-sheet workbook reading exclusively from the analyzer's verdict in
// `ClientRequirement.solutionProviderResponse` (see report-data.ts
// `getSapBestPracticeClassificationData`). Stays separate from the
// existing 16 reports — those aggregate analyst-output (StepResponse +
// GapResolution) and we never want to mix the two streams in one chart.

import type {
  SapBestPracticeClassificationData,
  ClassificationRow,
  ClassificationModuleBreakdown,
} from "@/lib/report/report-data";

function classificationRow(r: ClassificationRow): Record<string, unknown> {
  return {
    module: r.module,
    code: r.code,
    requirementClass: r.requirementClass,
    requirementType: r.requirementType ?? "",
    requirementText: r.requirementText,
    classification: r.classification,
    sapModule: r.sapModule || "",
    scopeItemIds: r.scopeItemIds || "",
    scopeItemNames: r.scopeItemNames || r.scopeItems || "",
    remarks: r.remarks,
  };
}

const ROW_COLUMNS = [
  { header: "Source Module", key: "module", width: 24 },
  { header: "Code", key: "code", width: 12 },
  { header: "Class", key: "requirementClass", width: 12 },
  { header: "Type", key: "requirementType", width: 14 },
  { header: "Requirement", key: "requirementText", width: 60 },
  { header: "Classification", key: "classification", width: 20 },
  { header: "SAP Module", key: "sapModule", width: 18 },
  { header: "2602 Scope ID(s)", key: "scopeItemIds", width: 22 },
  { header: "2602 Scope Name(s)", key: "scopeItemNames", width: 50 },
  { header: "Aptus Remarks", key: "remarks", width: 70 },
];

function summaryRows(data: SapBestPracticeClassificationData): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  rows.push({ section: "TOTAL", scope: "All requirements", total: data.totals.grand,
    O: data.totals.O, C: data.totals.C, G: data.totals.G, NA: data.totals.NA, Pending: data.totals.Pending });
  rows.push({}); // spacer
  rows.push({ section: "PER CLASS" });
  for (const cls of Object.keys(data.perClass).sort()) {
    const b = data.perClass[cls]!;
    rows.push({ scope: cls, total: b.total, O: b.O, C: b.C, G: b.G, NA: b.NA, Pending: b.Pending });
  }
  rows.push({});
  rows.push({ section: "PER SOURCE MODULE" });
  for (const m of data.perModule) {
    rows.push({ scope: m.module, total: m.total, O: m.O, C: m.C, G: m.G, NA: m.NA, Pending: m.Pending });
  }

  // Per SAP module breakdown — derived on the fly from the row-level
  // sapModule field. Helps you see "how much of the assessment maps to
  // FI-AR vs SuccessFactors vs Ariba" at a glance.
  const sapModuleAgg = new Map<string, { O: number; C: number; G: number; NA: number; Pending: number; total: number }>();
  const allRows = [
    ...data.byBucket.O,
    ...data.byBucket.C,
    ...data.byBucket.G,
    ...data.byBucket.NA,
    ...data.byBucket.Pending,
  ];
  for (const r of allRows) {
    const key = (r.sapModule || "(unset)").trim() || "(unset)";
    const cur = sapModuleAgg.get(key) ?? { O: 0, C: 0, G: 0, NA: 0, Pending: 0, total: 0 };
    cur[r.bucket]++;
    cur.total++;
    sapModuleAgg.set(key, cur);
  }
  if (sapModuleAgg.size > 0) {
    rows.push({});
    rows.push({ section: "PER SAP MODULE / TARGET PRODUCT" });
    const sorted = [...sapModuleAgg.entries()].sort((a, b) => b[1].total - a[1].total);
    for (const [name, b] of sorted) {
      rows.push({ scope: name, total: b.total, O: b.O, C: b.C, G: b.G, NA: b.NA, Pending: b.Pending });
    }
  }
  return rows;
}

export function sapBestPracticeClassificationSheets(
  data: SapBestPracticeClassificationData,
): SheetConfig[] {
  const sheets: SheetConfig[] = [];

  sheets.push({
    name: "Summary",
    columns: [
      { header: "Section", key: "section", width: 14 },
      { header: "Scope", key: "scope", width: 32 },
      { header: "Total", key: "total", width: 8 },
      { header: "O", key: "O", width: 6 },
      { header: "C", key: "C", width: 6 },
      { header: "G", key: "G", width: 6 },
      { header: "N/A", key: "NA", width: 6 },
      { header: "Pending", key: "Pending", width: 9 },
    ],
    rows: summaryRows(data),
  });

  sheets.push({
    name: "Out-of-the-Box (O)",
    columns: ROW_COLUMNS,
    rows: data.byBucket.O.map(classificationRow),
  });

  sheets.push({
    name: "Configuration (C)",
    columns: ROW_COLUMNS,
    rows: data.byBucket.C.map(classificationRow),
  });

  sheets.push({
    name: "Gaps (G)",
    columns: ROW_COLUMNS,
    rows: data.byBucket.G.map(classificationRow),
  });

  sheets.push({
    // ExcelJS forbids / : * ? \ [ ] in sheet names — keep it slash-free.
    name: "Out of Scope (NA)",
    columns: ROW_COLUMNS,
    rows: data.byBucket.NA.map(classificationRow),
  });

  sheets.push({
    name: "Pending Classification",
    columns: ROW_COLUMNS,
    rows: data.byBucket.Pending.map(classificationRow),
  });

  return sheets;
}

// Silence unused-type warnings on module breakdown (kept exported in
// report-data.ts for the PDF generator's signature).
export type _ClassificationModuleBreakdown = ClassificationModuleBreakdown;
