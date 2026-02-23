/** CSV adapter — exports assessment data as CSV text */

import type {
  AlmAdapter,
  AlmWorkItem,
  AlmExportResult,
  AlmExportConfig,
  AlmFieldMapping,
} from "./adapter-interface";
import type { SnapshotData } from "@/types/signoff";

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export class CsvAdapter implements AlmAdapter {
  readonly targetSystem = "CSV" as const;

  transformToWorkItems(
    snapshotData: SnapshotData,
    config: AlmExportConfig,
    _mapping?: AlmFieldMapping | undefined,
  ): AlmWorkItem[] {
    const items: AlmWorkItem[] = [];

    if (config.includeGaps !== false) {
      for (const gap of snapshotData.gapResolutions) {
        items.push({
          type: "story",
          title: gap.resolutionDescription.substring(0, 200),
          description: gap.resolutionDescription,
          priority: (gap.priority as AlmWorkItem["priority"]) ?? "medium",
          labels: ["gap", gap.resolutionType],
          customFields: {
            category: "gap",
            scopeItemId: gap.scopeItemId,
            processStepId: gap.processStepId,
            resolutionType: gap.resolutionType,
            riskCategory: gap.riskCategory ?? "",
            clientApproved: gap.clientApproved ? "Yes" : "No",
          },
        });
      }
    }

    if (config.includeIntegrations !== false) {
      for (const int of snapshotData.integrationPoints) {
        items.push({
          type: "story",
          title: int.name,
          description: `${int.direction}: ${int.sourceSystem} → ${int.targetSystem}`,
          priority: "medium",
          labels: ["integration"],
          customFields: {
            category: "integration",
            direction: int.direction,
            sourceSystem: int.sourceSystem,
            targetSystem: int.targetSystem,
            interfaceType: int.interfaceType,
            status: int.status,
          },
        });
      }
    }

    if (config.includeDataMigration !== false) {
      for (const dm of snapshotData.dataMigrationObjects) {
        items.push({
          type: "story",
          title: dm.objectName,
          description: `${dm.objectType} from ${dm.sourceSystem}`,
          priority: "medium",
          labels: ["data-migration"],
          customFields: {
            category: "data-migration",
            objectType: dm.objectType,
            sourceSystem: dm.sourceSystem,
            status: dm.status,
          },
        });
      }
    }

    return items;
  }

  async exportWorkItems(
    workItems: AlmWorkItem[],
    _config: AlmExportConfig,
  ): Promise<AlmExportResult> {
    // CSV adapter generates a CSV string stored in resultSummary
    const headers = ["Type", "Title", "Description", "Priority", "Labels", "Category", "Custom Fields"];
    const rows = workItems.map((item) => [
      escapeCsv(item.type),
      escapeCsv(item.title),
      escapeCsv(item.description),
      escapeCsv(item.priority),
      escapeCsv(item.labels.join("; ")),
      escapeCsv(item.customFields.category ?? ""),
      escapeCsv(JSON.stringify(item.customFields)),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    return {
      success: true,
      itemsExported: workItems.length,
      itemsFailed: 0,
      errors: [],
      resultSummary: {
        format: "csv",
        totalItems: workItems.length,
        csvContent,
      },
    };
  }

  validateConfig(_config: AlmExportConfig): { valid: boolean; errors: string[] } {
    // CSV export has no external dependencies
    return { valid: true, errors: [] };
  }
}
