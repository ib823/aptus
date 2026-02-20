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
