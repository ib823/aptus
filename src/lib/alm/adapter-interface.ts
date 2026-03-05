/** ALM adapter interface — abstracts export to external project management tools */

import type { SnapshotData } from "@/types/signoff";
import type { AlmTarget } from "@/types/signoff";

/** Exported work item for ALM systems */
export interface AlmWorkItem {
  externalId?: string;
  type: "epic" | "story" | "task" | "bug" | "requirement";
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  labels: string[];
  parentExternalId?: string;
  customFields: Record<string, string>;
}

/** Result of an ALM export operation */
export interface AlmExportResult {
  success: boolean;
  itemsExported: number;
  itemsFailed: number;
  errors: Array<{ item: string; error: string }>;
  externalUrl?: string;
  resultSummary: Record<string, unknown>;
}

/** Configuration for ALM export */
export interface AlmExportConfig {
  projectKey?: string;
  projectId?: string;
  baseUrl?: string;
  apiToken?: string;
  includeGaps?: boolean;
  includeIntegrations?: boolean;
  includeDataMigration?: boolean;
  includeOcm?: boolean;
  customMapping?: Record<string, string>;
}

/** Mapping rules for field transformation */
export interface AlmFieldMapping {
  gapResolutionType?: Record<string, string>;
  priorityMapping?: Record<string, string>;
  statusMapping?: Record<string, string>;
}

/** Base adapter interface */
export interface AlmAdapter {
  readonly targetSystem: AlmTarget;

  /** Transform snapshot data into ALM work items */
  transformToWorkItems(
    snapshotData: SnapshotData,
    config: AlmExportConfig,
    mapping?: AlmFieldMapping,
  ): AlmWorkItem[];

  /** Export work items to the target system (returns result summary) */
  exportWorkItems(
    workItems: AlmWorkItem[],
    config: AlmExportConfig,
  ): Promise<AlmExportResult>;

  /** Validate the export configuration */
  validateConfig(config: AlmExportConfig): { valid: boolean; errors: string[] };
}
