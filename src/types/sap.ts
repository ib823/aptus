/** SAP catalog data types — derived from database models */

export interface ScopeItemSummary {
  id: string;
  name: string;
  nameClean: string;
  country: string;
  totalSteps: number;
  functionalArea: string;
  subArea: string;
  tutorialUrl: string | null;
  docxStored: boolean;
  xlsxStored: boolean;
  setupPdfStored: boolean;
}

export interface ScopeItemDetail extends ScopeItemSummary {
  purposeHtml: string;
  overviewHtml: string;
  prerequisitesHtml: string;
  language: string;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessStepSummary {
  id: string;
  scopeItemId: string;
  sequence: number;
  actionTitle: string;
  stepType: string;
  processFlowGroup: string | null;
  solutionProcessName: string | null;
  solutionProcessFlowName: string | null;
}

export interface ProcessStepDetail extends ProcessStepSummary {
  testCaseGuid: string | null;
  testCaseName: string | null;
  scopeGuid: string | null;
  scopeName: string | null;
  solutionProcessGuid: string | null;
  solutionProcessFlowGuid: string | null;
  flowDiagramGuid: string | null;
  flowDiagramName: string | null;
  testCasePriority: string | null;
  testCaseOwner: string | null;
  testCaseStatus: string | null;
  activityGuid: string | null;
  activityTitle: string | null;
  activityTargetName: string | null;
  activityTargetUrl: string | null;
  actionGuid: string | null;
  actionInstructionsHtml: string;
  actionExpectedResult: string | null;
}

export interface ConfigActivitySummary {
  id: string;
  scopeItemId: string;
  applicationArea: string;
  applicationSubarea: string;
  configItemName: string;
  activityDescription: string;
  selfService: boolean;
  category: string;
}

export type StepType =
  | "LOGON"
  | "ACCESS_APP"
  | "INFORMATION"
  | "DATA_ENTRY"
  | "ACTION"
  | "VERIFICATION"
  | "NAVIGATION"
  | "PROCESS_STEP";
