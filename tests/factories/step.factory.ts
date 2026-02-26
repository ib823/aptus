import type { ProcessStep } from "@prisma/client";

let counter = 0;
const nextId = () => `test-${++counter}`;

type StepOverrides = Partial<ProcessStep>;

const STEP_TYPES = [
  "BusinessProcess",
  "Configuration",
  "Reporting",
  "Information",
  "LogOn",
  "LogOff",
  "TestProcedure",
  "MasterData",
] as const;

type StepType = (typeof STEP_TYPES)[number];

function createBase(overrides: StepOverrides = {}): ProcessStep {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    scopeItemId: overrides.scopeItemId ?? `J${Math.floor(Math.random() * 99) + 1}`,
    sequence: overrides.sequence ?? 1,
    testCaseGuid: overrides.testCaseGuid ?? null,
    testCaseName: overrides.testCaseName ?? null,
    scopeGuid: overrides.scopeGuid ?? null,
    scopeName: overrides.scopeName ?? null,
    solutionProcessGuid: overrides.solutionProcessGuid ?? null,
    solutionProcessName: overrides.solutionProcessName ?? null,
    solutionProcessFlowGuid: overrides.solutionProcessFlowGuid ?? null,
    solutionProcessFlowName: overrides.solutionProcessFlowName ?? null,
    flowDiagramGuid: overrides.flowDiagramGuid ?? null,
    flowDiagramName: overrides.flowDiagramName ?? null,
    testCasePriority: overrides.testCasePriority ?? null,
    testCaseOwner: overrides.testCaseOwner ?? null,
    testCaseStatus: overrides.testCaseStatus ?? null,
    activityGuid: overrides.activityGuid ?? null,
    activityTitle: overrides.activityTitle ?? null,
    activityTargetName: overrides.activityTargetName ?? null,
    activityTargetUrl: overrides.activityTargetUrl ?? null,
    actionGuid: overrides.actionGuid ?? null,
    actionTitle: overrides.actionTitle ?? `Action Step ${id}`,
    actionInstructionsHtml: overrides.actionInstructionsHtml ?? `<p>Instructions for step ${id}</p>`,
    actionExpectedResult: overrides.actionExpectedResult ?? null,
    stepType: overrides.stepType ?? "BusinessProcess",
    processFlowGroup: overrides.processFlowGroup ?? null,
    stepCategory: overrides.stepCategory ?? null,
    parsedContent: overrides.parsedContent ?? null,
    isClassifiable: overrides.isClassifiable ?? true,
    groupKey: overrides.groupKey ?? null,
    activityId: overrides.activityId ?? null,
    groupLabel: overrides.groupLabel ?? null,
    createdAt: overrides.createdAt ?? now,
  };
}

export function create(overrides: StepOverrides = {}): ProcessStep {
  return createBase(overrides);
}

export function createMany(count: number, overrides: StepOverrides = {}): ProcessStep[] {
  return Array.from({ length: count }, (_, i) =>
    createBase({ sequence: i + 1, ...overrides }),
  );
}

export function createClassifiable(
  tag: StepType,
  overrides: StepOverrides = {},
): ProcessStep {
  return createBase({
    stepType: tag,
    isClassifiable: true,
    stepCategory: tag === "BusinessProcess" ? "core" : tag === "Configuration" ? "config" : "other",
    parsedContent: {
      type: tag,
      text: `Parsed content for ${tag} step`,
      tokens: [`token_${tag.toLowerCase()}`],
    },
    groupKey: `group_${tag.toLowerCase()}`,
    groupLabel: `${tag} Group`,
    ...overrides,
  });
}

export function createReference(
  tag: StepType,
  overrides: StepOverrides = {},
): ProcessStep {
  return createBase({
    stepType: tag,
    isClassifiable: false,
    stepCategory: "reference",
    parsedContent: null,
    groupKey: null,
    groupLabel: null,
    ...overrides,
  });
}

export function createWithRealSAPContent(overrides: StepOverrides = {}): ProcessStep {
  return createBase({
    scopeItemId: "J60",
    stepType: "BusinessProcess",
    testCaseName: "Accounts Payable - Invoice Processing",
    solutionProcessName: "Invoice Receipt",
    solutionProcessFlowName: "Accounts Payable Flow",
    activityTitle: "Post Vendor Invoice",
    activityId: overrides.activityId ?? "real-sap-activity-1",
    actionTitle: "Create Vendor Invoice",
    actionInstructionsHtml:
      "<p>Navigate to transaction FB60. Enter the vendor number in the <b>Vendor</b> field. " +
      "Enter the invoice date and amount. Select the appropriate payment terms. " +
      "Enter the G/L account assignment on the line items. Click <b>Post</b>.</p>",
    actionExpectedResult:
      "The vendor invoice is posted successfully and a document number is generated.",
    stepCategory: "core",
    isClassifiable: true,
    parsedContent: {
      type: "BusinessProcess",
      transaction: "FB60",
      entity: "Vendor Invoice",
      action: "Create",
      fields: ["Vendor", "Invoice Date", "Amount", "Payment Terms", "G/L Account"],
    },
    groupKey: "accounts_payable",
    groupLabel: "Accounts Payable",
    ...overrides,
  });
}

export function createWithHierarchy(overrides: StepOverrides = {}): ProcessStep {
  return createBase({
    scopeItemId: "J60",
    stepType: "BusinessProcess",
    solutionProcessName: "Invoice Receipt",
    solutionProcessFlowName: "Accounts Payable Flow",
    activityTitle: "Post Vendor Invoice",
    activityId: overrides.activityId ?? "test-activity-1",
    actionTitle: "Create Vendor Invoice",
    actionInstructionsHtml: "<p>Navigate to FB60. Enter vendor, amount, payment terms.</p>",
    actionExpectedResult: "Invoice posted, document number generated.",
    stepCategory: "BUSINESS_PROCESS",
    isClassifiable: true,
    groupKey: "BUSINESS_PROCESS:Post Vendor Invoice",
    groupLabel: "Post Vendor Invoice",
    ...overrides,
  });
}

export function createBulk(
  count: number,
  options: {
    scopeItemId?: string;
    stepType?: StepType;
    classifiable?: boolean;
  } = {},
): ProcessStep[] {
  const scopeItemId = options.scopeItemId ?? `J${Math.floor(Math.random() * 99) + 1}`;
  const stepType = options.stepType ?? "BusinessProcess";
  const classifiable = options.classifiable ?? true;
  return Array.from({ length: count }, (_, i) =>
    createBase({
      scopeItemId,
      sequence: i + 1,
      stepType,
      isClassifiable: classifiable,
      actionTitle: `Bulk Step ${i + 1}`,
      actionInstructionsHtml: `<p>Bulk instruction ${i + 1}</p>`,
    }),
  );
}

export { STEP_TYPES };
export type { StepType };
