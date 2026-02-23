/** XLSX report generation using ExcelJS */

import ExcelJS from "exceljs";

interface SheetConfig {
  name: string;
  columns: Array<{ header: string; key: string; width: number }>;
  rows: Array<Record<string, unknown>>;
}

export async function generateXlsx(sheets: SheetConfig[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Aptus";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    ws.columns = sheet.columns;

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F2937" },
    };
    headerRow.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    headerRow.alignment = { vertical: "middle" };
    headerRow.height = 28;

    for (const row of sheet.rows) {
      ws.addRow(row);
    }

    // Auto-filter
    if (sheet.rows.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: sheet.rows.length + 1, column: sheet.columns.length },
      };
    }

    // Freeze header row
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
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
