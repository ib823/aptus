/** Jira ALM adapter — transforms assessment data into Jira-compatible work items */

import type {
  AlmAdapter,
  AlmWorkItem,
  AlmExportResult,
  AlmExportConfig,
  AlmFieldMapping,
} from "./adapter-interface";
import type { SnapshotData } from "@/types/signoff";

const DEFAULT_PRIORITY_MAP: Record<string, string> = {
  critical: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const DEFAULT_RESOLUTION_TYPE_MAP: Record<string, string> = {
  workaround: "Story",
  customization: "Story",
  extension: "Epic",
  process_change: "Task",
  third_party: "Story",
  accept: "Task",
};

export class JiraAdapter implements AlmAdapter {
  readonly targetSystem = "JIRA" as const;

  transformToWorkItems(
    snapshotData: SnapshotData,
    config: AlmExportConfig,
    mapping?: AlmFieldMapping,
  ): AlmWorkItem[] {
    const items: AlmWorkItem[] = [];
    const typeMap = mapping?.gapResolutionType ?? DEFAULT_RESOLUTION_TYPE_MAP;
    const projectKey = config.projectKey ?? "FIT";

    // Gap resolutions → stories/epics
    if (config.includeGaps !== false) {
      for (const gap of snapshotData.gapResolutions) {
        const jiraType = typeMap[gap.resolutionType] ?? "Story";
        items.push({
          type: jiraType.toLowerCase() as AlmWorkItem["type"],
          title: `[GAP] ${gap.resolutionDescription.substring(0, 100)}`,
          description: [
            `**Resolution Type:** ${gap.resolutionType}`,
            `**Priority:** ${gap.priority ?? "medium"}`,
            `**Risk Category:** ${gap.riskCategory ?? "unspecified"}`,
            `**Scope Item:** ${gap.scopeItemId}`,
            `**Process Step:** ${gap.processStepId}`,
            `**Client Approved:** ${gap.clientApproved ? "Yes" : "No"}`,
            "",
            gap.resolutionDescription,
          ].join("\n"),
          priority: (gap.priority as AlmWorkItem["priority"]) ?? "medium",
          labels: [`${projectKey}-gap`, gap.resolutionType, gap.riskCategory ?? "unspecified"],
          customFields: {
            scopeItemId: gap.scopeItemId,
            processStepId: gap.processStepId,
            resolutionType: gap.resolutionType,
          },
        });
      }
    }

    // Integration points → stories
    if (config.includeIntegrations !== false) {
      for (const int of snapshotData.integrationPoints) {
        items.push({
          type: "story",
          title: `[INT] ${int.name}`,
          description: [
            `**Direction:** ${int.direction}`,
            `**Source:** ${int.sourceSystem}`,
            `**Target:** ${int.targetSystem}`,
            `**Interface Type:** ${int.interfaceType}`,
            `**Status:** ${int.status}`,
          ].join("\n"),
          priority: "medium",
          labels: [`${projectKey}-integration`, int.direction, int.interfaceType],
          customFields: {
            sourceSystem: int.sourceSystem,
            targetSystem: int.targetSystem,
            direction: int.direction,
          },
        });
      }
    }

    // Data migration objects → stories
    if (config.includeDataMigration !== false) {
      for (const dm of snapshotData.dataMigrationObjects) {
        items.push({
          type: "story",
          title: `[DM] ${dm.objectName}`,
          description: [
            `**Object Type:** ${dm.objectType}`,
            `**Source System:** ${dm.sourceSystem}`,
            `**Status:** ${dm.status}`,
          ].join("\n"),
          priority: "medium",
          labels: [`${projectKey}-data-migration`, dm.objectType],
          customFields: {
            objectType: dm.objectType,
            sourceSystem: dm.sourceSystem,
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
    // In production, this would call the Jira REST API
    // For now, generate a structured export payload
    if (!config.baseUrl || !config.apiToken || !config.projectKey) {
      return {
        success: false,
        itemsExported: 0,
        itemsFailed: workItems.length,
        errors: [{ item: "*", error: "Missing Jira configuration (baseUrl, apiToken, projectKey)" }],
        resultSummary: { reason: "missing_config" },
      };
    }

    // Simulate export — in production, iterate and POST to /rest/api/3/issue
    return {
      success: true,
      itemsExported: workItems.length,
      itemsFailed: 0,
      errors: [],
      externalUrl: `${config.baseUrl}/projects/${config.projectKey}/board`,
      resultSummary: {
        projectKey: config.projectKey,
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
    if (!config.baseUrl) errors.push("Jira baseUrl is required");
    if (!config.apiToken) errors.push("Jira apiToken is required");
    if (!config.projectKey) errors.push("Jira projectKey is required");
    return { valid: errors.length === 0, errors };
  }
}
