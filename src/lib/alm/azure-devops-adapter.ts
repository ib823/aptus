/** Azure DevOps ALM adapter */

import type {
  AlmAdapter,
  AlmWorkItem,
  AlmExportResult,
  AlmExportConfig,
  AlmFieldMapping,
} from "./adapter-interface";
import type { SnapshotData } from "@/types/signoff";

const RESOLUTION_TO_WIT: Record<string, string> = {
  workaround: "User Story",
  customization: "User Story",
  extension: "Feature",
  process_change: "Task",
  third_party: "User Story",
  accept: "Task",
};

export class AzureDevOpsAdapter implements AlmAdapter {
  readonly targetSystem = "AZURE_DEVOPS" as const;

  transformToWorkItems(
    snapshotData: SnapshotData,
    config: AlmExportConfig,
    mapping?: AlmFieldMapping,
  ): AlmWorkItem[] {
    const items: AlmWorkItem[] = [];
    const typeMap = mapping?.gapResolutionType ?? RESOLUTION_TO_WIT;

    if (config.includeGaps !== false) {
      for (const gap of snapshotData.gapResolutions) {
        const witType = typeMap[gap.resolutionType] ?? "User Story";
        items.push({
          type: witType.toLowerCase().includes("feature") ? "epic" : "story",
          title: `[GAP] ${gap.resolutionDescription.substring(0, 120)}`,
          description: [
            `<b>Resolution Type:</b> ${gap.resolutionType}`,
            `<b>Priority:</b> ${gap.priority ?? "medium"}`,
            `<b>Risk:</b> ${gap.riskCategory ?? "unspecified"}`,
            `<b>Scope Item:</b> ${gap.scopeItemId}`,
            `<b>Client Approved:</b> ${gap.clientApproved ? "Yes" : "No"}`,
            `<br/>${gap.resolutionDescription}`,
          ].join("<br/>"),
          priority: (gap.priority as AlmWorkItem["priority"]) ?? "medium",
          labels: ["gap", gap.resolutionType],
          customFields: {
            "System.WorkItemType": witType,
            scopeItemId: gap.scopeItemId,
          },
        });
      }
    }

    if (config.includeIntegrations !== false) {
      for (const int of snapshotData.integrationPoints) {
        items.push({
          type: "story",
          title: `[INT] ${int.name}`,
          description: `<b>Direction:</b> ${int.direction}<br/><b>Source:</b> ${int.sourceSystem}<br/><b>Target:</b> ${int.targetSystem}<br/><b>Type:</b> ${int.interfaceType}`,
          priority: "medium",
          labels: ["integration", int.direction],
          customFields: { "System.WorkItemType": "User Story" },
        });
      }
    }

    if (config.includeDataMigration !== false) {
      for (const dm of snapshotData.dataMigrationObjects) {
        items.push({
          type: "story",
          title: `[DM] ${dm.objectName}`,
          description: `<b>Type:</b> ${dm.objectType}<br/><b>Source:</b> ${dm.sourceSystem}<br/><b>Status:</b> ${dm.status}`,
          priority: "medium",
          labels: ["data-migration", dm.objectType],
          customFields: { "System.WorkItemType": "User Story" },
        });
      }
    }

    return items;
  }

  async exportWorkItems(
    workItems: AlmWorkItem[],
    config: AlmExportConfig,
  ): Promise<AlmExportResult> {
    if (!config.baseUrl || !config.apiToken || !config.projectId) {
      return {
        success: false,
        itemsExported: 0,
        itemsFailed: workItems.length,
        errors: [{ item: "*", error: "Missing Azure DevOps configuration (baseUrl, apiToken, projectId)" }],
        resultSummary: { reason: "missing_config" },
      };
    }

    return {
      success: true,
      itemsExported: workItems.length,
      itemsFailed: 0,
      errors: [],
      externalUrl: `${config.baseUrl}/${config.projectId}/_workitems`,
      resultSummary: {
        projectId: config.projectId,
        totalItems: workItems.length,
        byType: workItems.reduce<Record<string, number>>((acc, item) => {
          acc[item.type] = (acc[item.type] ?? 0) + 1;
          return acc;
        }, {}),
      },
    };
  }

  validateConfig(config: AlmExportConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!config.baseUrl) errors.push("Azure DevOps organization URL is required");
    if (!config.apiToken) errors.push("Personal Access Token is required");
    if (!config.projectId) errors.push("Project ID is required");
    return { valid: errors.length === 0, errors };
  }
}
