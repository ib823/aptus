/**
 * REM-32: Process Landscape Map data.
 * Maps scope items into business process chains so department heads
 * can understand how SAP covers their area as connected workflows.
 *
 * Pure data + types. No runtime dependencies.
 */

// --- Types ---

export interface ChainStep {
  scopeItemId: string;
  businessName: string;
  roleInChain: string;
  position: "start" | "middle" | "end" | "branch";
  followsStepIndex?: number;
}

export interface ProcessChain {
  key: string;
  name: string;
  abbreviation: string;
  description: string;
  type: "core" | "supporting" | "specialized";
  steps: ChainStep[];
}

export interface FunctionalAreaLandscape {
  area: string;
  businessDescription: string;
  chains: ProcessChain[];
}

// --- Data ---

export const PROCESS_LANDSCAPES: FunctionalAreaLandscape[] = [
  // ===== FINANCE =====
  {
    area: "Finance",
    businessDescription:
      "Financial accounting, closing, payments, receivables, bank integration, and asset management.",
    chains: [
      {
        key: "r2r",
        name: "Record to Report",
        abbreviation: "R2R",
        description:
          "From daily transactions through month-end closing to financial statements.",
        type: "core",
        steps: [
          {
            scopeItemId: "J63",
            businessName: "Cost Center Accounting",
            roleInChain: "Track departmental costs",
            position: "start",
          },
          {
            scopeItemId: "J58",
            businessName: "Financial Closing",
            roleInChain: "Month-end & year-end close",
            position: "middle",
          },
          {
            scopeItemId: "J58A",
            businessName: "Intercompany Reconciliation",
            roleInChain: "Reconcile between entities",
            position: "end",
          },
          {
            scopeItemId: "2NV",
            businessName: "Revenue Recognition",
            roleInChain: "IFRS 15 contract accounting",
            position: "branch",
            followsStepIndex: 1,
          },
        ],
      },
      {
        key: "p2p-fin",
        name: "Procure to Pay (Finance)",
        abbreviation: "P2P",
        description:
          "From vendor invoice receipt through payment processing.",
        type: "core",
        steps: [
          {
            scopeItemId: "J60",
            businessName: "Accounts Payable",
            roleInChain: "Process vendor invoices",
            position: "start",
          },
          {
            scopeItemId: "1EG",
            businessName: "Bank Statement Integration",
            roleInChain: "Match bank transactions",
            position: "middle",
          },
          {
            scopeItemId: "BFB",
            businessName: "Bank & Cash Management",
            roleInChain: "Daily reconciliation",
            position: "end",
          },
        ],
      },
      {
        key: "o2c-fin",
        name: "Order to Cash (Finance)",
        abbreviation: "O2C",
        description:
          "From customer invoice through payment receipt and credit management.",
        type: "core",
        steps: [
          {
            scopeItemId: "J59",
            businessName: "Accounts Receivable",
            roleInChain: "Invoice customers & collect",
            position: "start",
          },
          {
            scopeItemId: "1EZ",
            businessName: "Credit Memo Processing",
            roleInChain: "Process returns & adjustments",
            position: "end",
          },
        ],
      },
      {
        key: "treasury",
        name: "Treasury & Cash Management",
        abbreviation: "TCM",
        description:
          "Cash flow forecasting, bank account management, and liquidity.",
        type: "supporting",
        steps: [
          {
            scopeItemId: "J61",
            businessName: "Treasury Management",
            roleInChain: "Forecast & manage cash",
            position: "start",
          },
          {
            scopeItemId: "1EG",
            businessName: "Bank Statement Integration",
            roleInChain: "Import bank data",
            position: "end",
          },
        ],
      },
      {
        key: "assets",
        name: "Asset Lifecycle",
        abbreviation: "ALM",
        description:
          "Acquisition, depreciation, and retirement of fixed assets.",
        type: "supporting",
        steps: [
          {
            scopeItemId: "J77",
            businessName: "Fixed Asset Management",
            roleInChain: "Track & depreciate assets",
            position: "start",
          },
        ],
      },
    ],
  },

  // ===== PROCUREMENT =====
  {
    area: "Procurement",
    businessDescription:
      "Purchasing goods and services, managing suppliers, travel expenses, and self-service ordering.",
    chains: [
      {
        key: "p2p",
        name: "Procure to Pay",
        abbreviation: "P2P",
        description:
          "End-to-end: purchase request, approval, PO, goods receipt, invoice.",
        type: "core",
        steps: [
          {
            scopeItemId: "1FC",
            businessName: "Purchase Order Processing",
            roleInChain: "Create & approve POs",
            position: "start",
          },
          {
            scopeItemId: "J14",
            businessName: "End-to-End Procurement",
            roleInChain: "Full procurement cycle",
            position: "middle",
          },
          {
            scopeItemId: "BNX",
            businessName: "Consumables Purchasing",
            roleInChain: "Buy office & maintenance supplies",
            position: "end",
          },
        ],
      },
      {
        key: "t-and-e",
        name: "Travel & Expense",
        abbreviation: "T&E",
        description:
          "Employee travel requests, bookings, expense claims, and reimbursement.",
        type: "supporting",
        steps: [
          {
            scopeItemId: "BD2",
            businessName: "Expense Management",
            roleInChain: "Submit & approve expenses",
            position: "start",
          },
        ],
      },
      {
        key: "sourcing",
        name: "Strategic Sourcing",
        abbreviation: "SRC",
        description:
          "Supplier evaluation, RFQ, bid comparison, and vendor selection.",
        type: "specialized",
        steps: [
          {
            scopeItemId: "BNL",
            businessName: "Sourcing & Evaluation",
            roleInChain: "RFQ & vendor selection",
            position: "start",
          },
        ],
      },
      {
        key: "self-service",
        name: "Self-Service Procurement",
        abbreviation: "SSP",
        description:
          "Employees request and order standard items directly.",
        type: "supporting",
        steps: [
          {
            scopeItemId: "BNX",
            businessName: "Self-Service Ordering",
            roleInChain: "Order consumables directly",
            position: "start",
          },
        ],
      },
    ],
  },

  // ===== SALES =====
  {
    area: "Sales",
    businessDescription:
      "Customer orders, delivery, billing, and returns processing.",
    chains: [
      {
        key: "o2c",
        name: "Order to Cash",
        abbreviation: "O2C",
        description:
          "From customer order through delivery and billing.",
        type: "core",
        steps: [
          {
            scopeItemId: "BKP",
            businessName: "Sales Order Processing",
            roleInChain: "Receive & fulfill orders",
            position: "start",
          },
          {
            scopeItemId: "J56",
            businessName: "Delivery & Shipping",
            roleInChain: "Ship goods to customers",
            position: "end",
          },
        ],
      },
      {
        key: "returns",
        name: "Returns & Credits",
        abbreviation: "RET",
        description:
          "Customer returns, refunds, and reverse logistics.",
        type: "supporting",
        steps: [
          {
            scopeItemId: "BEF",
            businessName: "Returns Processing",
            roleInChain: "Handle customer returns",
            position: "start",
          },
        ],
      },
    ],
  },

  // ===== WAREHOUSE =====
  {
    area: "Warehouse",
    businessDescription:
      "Warehouse receiving, storage, picking, shipping, and inventory tracking.",
    chains: [
      {
        key: "wh-ops",
        name: "Warehouse Operations",
        abbreviation: "WHO",
        description:
          "Goods receipt, put-away, picking, packing, and shipping.",
        type: "core",
        steps: [
          {
            scopeItemId: "J45",
            businessName: "Warehouse Operations",
            roleInChain: "Full warehouse flow",
            position: "start",
          },
        ],
      },
      {
        key: "basic-wm",
        name: "Basic Warehouse Management",
        abbreviation: "BWM",
        description:
          "Simplified warehouse with goods receipt, put-away, and shipping.",
        type: "supporting",
        steps: [
          {
            scopeItemId: "1YB",
            businessName: "Basic WM",
            roleInChain: "Simplified warehouse ops",
            position: "start",
          },
        ],
      },
    ],
  },

  // ===== PRODUCTION =====
  {
    area: "Production",
    businessDescription:
      "Production planning, scheduling, bill of materials, and shop floor execution.",
    chains: [
      {
        key: "p2p-prod",
        name: "Plan to Produce",
        abbreviation: "P2P",
        description:
          "From demand planning through production execution.",
        type: "core",
        steps: [
          {
            scopeItemId: "J44",
            businessName: "Production Planning",
            roleInChain: "Schedule production runs",
            position: "start",
          },
          {
            scopeItemId: "J46",
            businessName: "Bill of Materials",
            roleInChain: "Define product structures",
            position: "end",
          },
        ],
      },
    ],
  },

  // ===== MAINTENANCE =====
  {
    area: "Maintenance",
    businessDescription:
      "Plant maintenance, work orders, preventive schedules, and equipment tracking.",
    chains: [
      {
        key: "m2o",
        name: "Maintain to Operate",
        abbreviation: "M2O",
        description:
          "Work orders, preventive maintenance, and equipment lifecycle.",
        type: "core",
        steps: [
          {
            scopeItemId: "BHR",
            businessName: "Plant Maintenance",
            roleInChain: "Manage work orders & schedules",
            position: "start",
          },
        ],
      },
    ],
  },

  // ===== SERVICES =====
  {
    area: "Services",
    businessDescription:
      "Service order management for internal and external service requests.",
    chains: [
      {
        key: "svc-mgmt",
        name: "Service Management",
        abbreviation: "SVC",
        description:
          "Creating, scheduling, and completing service orders.",
        type: "core",
        steps: [
          {
            scopeItemId: "BKC",
            businessName: "Service Orders",
            roleInChain: "Manage service requests",
            position: "start",
          },
        ],
      },
    ],
  },
];

// --- Helpers ---

/** Get the landscape data for a functional area, if it exists. */
export function getLandscape(area: string): FunctionalAreaLandscape | null {
  return PROCESS_LANDSCAPES.find((l) => l.area === area) ?? null;
}

/** Get all scope item IDs referenced in a chain. */
export function getChainScopeItemIds(chain: ProcessChain): string[] {
  return chain.steps.map((s) => s.scopeItemId);
}

/** Get all scope item IDs referenced across all chains in a functional area landscape. */
export function getAreaScopeItemIds(landscape: FunctionalAreaLandscape): string[] {
  const ids = new Set<string>();
  for (const chain of landscape.chains) {
    for (const step of chain.steps) {
      ids.add(step.scopeItemId);
    }
  }
  return Array.from(ids);
}
