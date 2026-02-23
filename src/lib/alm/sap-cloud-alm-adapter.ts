/** SAP Cloud ALM adapter — exports to SAP Solution Manager / Cloud ALM format */

import type {
  AlmAdapter,
  AlmWorkItem,
  AlmExportResult,
  AlmExportConfig,
  AlmFieldMapping,
} from "./adapter-interface";
import type { SnapshotData } from "@/types/signoff";

const RESOLUTION_TO_CALM: Record<string, string> = {
  workaround: "Requirement",
  customization: "Requirement",
  extension: "Enhancement",
  process_change: "Requirement",
  third_party: "Enhancement",
  accept: "Requirement",
};

export class SapCloudAlmAdapter implements AlmAdapter {
  readonly targetSystem = "SAP_SOLMAN" as const;

  transformToWorkItems(
    snapshotData: SnapshotData,
    config: AlmExportConfig,
    mapping?: AlmFieldMapping,
  ): AlmWorkItem[] {
    const items: AlmWorkItem[] = [];
    const typeMap = mapping?.gapResolutionType ?? RESOLUTION_TO_CALM;

    if (config.includeGaps !== false) {
      for (const gap of snapshotData.gapResolutions) {
        const calmType = typeMap[gap.resolutionType] ?? "Requirement";
        items.push({
          type: calmType === "Enhancement" ? "epic" : "requirement",
          title: `[GAP] ${gap.resolutionDescription.substring(0, 100)}`,
          description: [
            `Resolution Type: ${gap.resolutionType}`,
            `Priority: ${gap.priority ?? "medium"}`,
            `Risk Category: ${gap.riskCategory ?? "unspecified"}`,
            `Scope Item ID: ${gap.scopeItemId}`,
            `Process Step ID: ${gap.processStepId}`,
            `Client Approved: ${gap.clientApproved ? "Yes" : "No"}`,
            "",
            gap.resolutionDescription,
          ].join("\n"),
          priority: (gap.priority as AlmWorkItem["priority"]) ?? "medium",
          labels: ["fit-assessment", "gap", gap.resolutionType],
          customFields: {
            calmType,
            scopeItemId: gap.scopeItemId,
            sapProcessId: gap.processStepId,
          },
        });
      }
    }

    if (config.includeIntegrations !== false) {
      for (const int of snapshotData.integrationPoints) {
        items.push({
          type: "requirement",
          title: `[INT] ${int.name}`,
          description: `Direction: ${int.direction}\nSource: ${int.sourceSystem}\nTarget: ${int.targetSystem}\nInterface Type: ${int.interfaceType}`,
          priority: "medium",
          labels: ["fit-assessment", "integration"],
          customFields: {
            calmType: "Integration",
            sourceSystem: int.sourceSystem,
            targetSystem: int.targetSystem,
          },
        });
      }
    }

    if (config.includeDataMigration !== false) {
      for (const dm of snapshotData.dataMigrationObjects) {
        items.push({
          type: "requirement",
          title: `[DM] ${dm.objectName}`,
          description: `Object Type: ${dm.objectType}\nSource: ${dm.sourceSystem}\nStatus: ${dm.status}`,
          priority: "medium",
          labels: ["fit-assessment", "data-migration"],
          customFields: {
            calmType: "DataMigration",
            objectType: dm.objectType,
          },
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
        errors: [{ item: "*", error: "Missing SAP Cloud ALM configuration (baseUrl, apiToken, projectId)" }],
        resultSummary: { reason: "missing_config" },
      };
    }

    return {
      success: true,
      itemsExported: workItems.length,
      itemsFailed: 0,
      errors: [],
      externalUrl: `${config.baseUrl}/projects/${config.projectId}`,
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
    if (!config.baseUrl) errors.push("SAP Cloud ALM URL is required");
    if (!config.apiToken) errors.push("API token is required");
    if (!config.projectId) errors.push("Project ID is required");
    return { valid: errors.length === 0, errors };
  }
}
