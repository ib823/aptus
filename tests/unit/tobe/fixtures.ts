/**
 * Small, deterministic engine inputs for the To-Be tests. Two synthetic scope
 * items with three steps each, one chain, a handful of questions and rules.
 * Synthetic on purpose: the snapshot and precedence tests must not move when
 * SAP re-issues a BPD.
 */
import type { TobeEngineInput, TobeRuleInput } from "@/lib/tobe/types";

export const STEPS_AAA = [
  {
    name: "Create Sales Quotation",
    role: "Internal Sales Representative",
    app: "Manage Sales Quotations",
    expected: "Quotation created.",
  },
  { name: "Approve Quotation (Optional)", role: "Sales Manager", app: "My Inbox", expected: "Quotation approved." },
  {
    name: "Convert Quotation to Order",
    role: "Internal Sales Representative",
    app: "Manage Sales Orders",
    expected: "Order created.",
  },
];
export const STEPS_BBB = [
  {
    name: "Create Delivery",
    role: "Shipping Specialist",
    app: "Create Outbound Deliveries",
    expected: "Delivery created.",
  },
  { name: "Check Batches (Optional)", role: "Warehouse Clerk", app: "Manage Batches", expected: "Batches checked." },
  {
    name: "Post Goods Issue",
    role: "Shipping Specialist",
    app: "Manage Outbound Deliveries",
    expected: "Goods issued.",
  },
];

export const RULES: TobeRuleInput[] = [
  {
    id: "xref:Q-1:AAA",
    questionId: "Q-1",
    scopeCode: "AAA",
    trigger: "deviate",
    state: "CONFIGURED",
    sscuiId: "102751",
    sscuiName: "Define Reasons for Approval Requests",
    gapType: null,
    alternatePathId: null,
    stepNames: [],
    source: "bdc-sscui-xref-2608",
    note: null,
  },
  {
    id: "curated:Q-1:AAA",
    questionId: "Q-1",
    scopeCode: "AAA",
    trigger: "deviate",
    state: "CONFIGURED",
    sscuiId: "102751",
    sscuiName: "Define Reasons for Approval Requests",
    gapType: null,
    alternatePathId: null,
    stepNames: ["Approve Quotation (Optional)"],
    source: "curated",
    note: null,
  },
  {
    id: "curated:Q-2:AAA",
    questionId: "Q-2",
    scopeCode: "AAA",
    trigger: "deviate",
    state: "GAP",
    sscuiId: null,
    sscuiName: null,
    gapType: "extension",
    alternatePathId: null,
    stepNames: ["Approve Quotation (Optional)"],
    source: "curated",
    note: null,
  },
  {
    id: "curated:Q-3:BBB",
    questionId: "Q-3",
    scopeCode: "BBB",
    trigger: "discuss",
    state: "VARIANT",
    sscuiId: null,
    sscuiName: null,
    gapType: null,
    alternatePathId: "alt-1",
    stepNames: ["Create Delivery"],
    source: "curated",
    note: null,
  },
];

export function fixtureInput(overrides: Partial<TobeEngineInput> = {}): TobeEngineInput {
  return {
    release: "2608",
    scopeCodes: ["AAA", "BBB"],
    contents: {
      AAA: {
        code: "AAA",
        title: "Quotation to Order",
        release: "S/4HANA Cloud Public Edition 2608 — MY",
        business_roles: [
          { name: "Internal Sales Representative", id: "SAP_BR_INTERNAL_SALES_REP" },
          { name: "Sales Manager", id: "SAP_BR_SALES_MANAGER" },
        ],
        process_steps: STEPS_AAA,
      },
      BBB: {
        code: "BBB",
        title: "Delivery to Issue",
        release: "S/4HANA Cloud Public Edition 2608 — MY",
        business_roles: [
          { name: "Shipping Specialist", id: "SAP_BR_SHIPPING_SPECIALIST" },
          { name: "Warehouse Clerk", id: "SAP_BR_WAREHOUSE_CLERK" },
        ],
        process_steps: STEPS_BBB,
      },
      CCC: {
        code: "CCC",
        title: "Billing",
        release: "S/4HANA Cloud Public Edition 2608 — MY",
        business_roles: [{ name: "Billing Clerk", id: "SAP_BR_BILLING_CLERK" }],
        process_steps: [
          {
            name: "Create Billing Document",
            role: "Billing Clerk",
            app: "Create Billing Documents",
            expected: "Invoice created.",
          },
        ],
      },
    },
    answers: [],
    questions: [
      {
        id: "Q-1",
        sapVerbatim: "Do you require an approval workflow for sales quotations?",
        scopeItemRefs: ["AAA"],
        sscuiRef: "Define Reasons for Approval Requests",
        sourceQuestionnaire: "S4H_433  (Sales)",
        format: "decision",
      },
      {
        id: "Q-2",
        sapVerbatim: "Do you need approval steps beyond the standard?",
        scopeItemRefs: ["AAA"],
        sscuiRef: "N/A",
        sourceQuestionnaire: "S4H_433  (Sales)",
        format: "decision",
      },
      {
        id: "Q-3",
        sapVerbatim: "Do you deliver from more than one plant?",
        scopeItemRefs: ["BBB"],
        sscuiRef: "N/A",
        sourceQuestionnaire: "S4H_433  (Sales)",
        format: "decision",
      },
      {
        id: "Q-4",
        sapVerbatim: "Describe your shipping points.",
        scopeItemRefs: ["BBB"],
        sscuiRef: "N/A",
        sourceQuestionnaire: "S4H_433  (Sales)",
        format: "information",
      },
    ],
    rules: RULES,
    chains: [
      {
        id: "chain-1",
        name: "Quote to Issue",
        valueStreamId: "lead-to-cash",
        path: ["AAA", "BBB", "CCC"],
        alternates: [],
        source: "fixture",
      },
    ],
    generatedAt: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}
