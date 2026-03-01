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
            scopeItemId: "1K2",
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
            scopeItemId: "J62",
            businessName: "Asset Accounting",
            roleInChain: "Track & depreciate assets",
            position: "start",
          },
        ],
      },
    ],
  },

  // ===== SOURCING AND PROCUREMENT =====
  {
    area: "Sourcing and Procurement",
    businessDescription:
      "Strategic sourcing, purchasing goods and services, managing suppliers, travel expenses, and self-service ordering.",
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
            scopeItemId: "J45",
            businessName: "Direct Materials Procurement",
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

  // ===== LOGISTICS =====
  {
    area: "Logistics",
    businessDescription:
      "Warehouse operations, inventory management, goods receipt, storage, picking, packing, and shipping.",
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
            scopeItemId: "BMC",
            businessName: "Core Inventory Management",
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
            scopeItemId: "3BR",
            businessName: "Warehouse Inbound Processing",
            roleInChain: "Receive & put away goods",
            position: "start",
          },
          {
            scopeItemId: "3BS",
            businessName: "Warehouse Outbound Processing",
            roleInChain: "Pick, pack & ship",
            position: "end",
          },
        ],
      },
    ],
  },

  // ===== MANUFACTURING =====
  {
    area: "Manufacturing",
    businessDescription:
      "Production planning, scheduling, bill of materials, shop floor execution, and make-to-stock manufacturing.",
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

  // ===== ASSET MANAGEMENT =====
  {
    area: "Asset Management",
    businessDescription:
      "Plant maintenance, work orders, preventive schedules, equipment lifecycle, and asset tracking.",
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

  // ===== SERVICE =====
  {
    area: "Service",
    businessDescription:
      "Service order management, customer service requests, and field service operations.",
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

  // ===== SUPPLY CHAIN =====
  {
    area: "Supply Chain",
    businessDescription:
      "Supply chain planning, demand forecasting, inventory optimization, and material requirements planning.",
    chains: [
      {
        key: "sc-planning",
        name: "Supply Chain Planning",
        abbreviation: "SCP",
        description:
          "Demand forecasting, supply planning, and inventory optimization across the network.",
        type: "core",
        steps: [
          {
            scopeItemId: "1B5",
            businessName: "Demand Planning",
            roleInChain: "Forecast customer demand",
            position: "start",
          },
          {
            scopeItemId: "2K3",
            businessName: "Supply Planning",
            roleInChain: "Balance supply with demand",
            position: "end",
          },
        ],
      },
    ],
  },

  // ===== ENTERPRISE PORTFOLIO & PROJECT MANAGEMENT =====
  {
    area: "Enterprise Portfolio & Project Management",
    businessDescription:
      "Project lifecycle management, financial control, budgeting, and portfolio planning.",
    chains: [
      {
        key: "proj-lifecycle",
        name: "Project Lifecycle",
        abbreviation: "PLM",
        description:
          "From project setup through execution, cost tracking, and settlement.",
        type: "core",
        steps: [
          {
            scopeItemId: "1NT",
            businessName: "Project Financial Control",
            roleInChain: "Budget & cost tracking",
            position: "start",
          },
        ],
      },
    ],
  },

  // ===== QUALITY MANAGEMENT =====
  {
    area: "Quality Management",
    businessDescription:
      "Quality inspection, quality planning, certificates, and defect management.",
    chains: [
      {
        key: "qi-process",
        name: "Quality Inspection",
        abbreviation: "QI",
        description:
          "From quality planning through inspection execution and results recording.",
        type: "core",
        steps: [
          {
            scopeItemId: "1E1",
            businessName: "Quality Inspection",
            roleInChain: "Plan & execute inspections",
            position: "start",
          },
          {
            scopeItemId: "2QN",
            businessName: "Quality Certificates",
            roleInChain: "Issue quality certificates",
            position: "end",
          },
        ],
      },
    ],
  },

  // ===== R&D/ENGINEERING =====
  {
    area: "R&D/Engineering",
    businessDescription:
      "Product development, engineering change management, recipe and formula development.",
    chains: [
      {
        key: "product-dev",
        name: "Product Development",
        abbreviation: "PD",
        description:
          "Design, engineering changes, and product structure management.",
        type: "core",
        steps: [
          {
            scopeItemId: "1GP",
            businessName: "Engineering Change Management",
            roleInChain: "Manage design changes",
            position: "start",
          },
        ],
      },
    ],
  },

  // ===== ORGANIZATION =====
  {
    area: "Organization",
    businessDescription:
      "Enterprise structure setup, organizational units, company codes, plants, and business configuration.",
    chains: [
      {
        key: "org-setup",
        name: "Enterprise Structure Setup",
        abbreviation: "ESS",
        description:
          "Define company codes, plants, sales organizations, and purchasing organizations.",
        type: "core",
        steps: [
          {
            scopeItemId: "J01",
            businessName: "Organization Setup",
            roleInChain: "Define enterprise structure",
            position: "start",
          },
        ],
      },
    ],
  },

  // ===== DATABASE AND DATA MANAGEMENT =====
  {
    area: "Database and Data Management",
    businessDescription:
      "Master data governance, business partner consolidation, and product data management.",
    chains: [
      {
        key: "mdg",
        name: "Master Data Governance",
        abbreviation: "MDG",
        description:
          "Consolidate, cleanse, and maintain master data across the enterprise.",
        type: "core",
        steps: [
          {
            scopeItemId: "1N3",
            businessName: "Business Partner Consolidation",
            roleInChain: "Deduplicate & merge records",
            position: "start",
          },
          {
            scopeItemId: "1RK",
            businessName: "Business Partner Maintenance",
            roleInChain: "Bulk load & update records",
            position: "middle",
          },
          {
            scopeItemId: "1RM",
            businessName: "Product Master Maintenance",
            roleInChain: "Bulk load & update products",
            position: "end",
          },
        ],
      },
    ],
  },

  // ===== HUMAN RESOURCES =====
  {
    area: "Human Resources",
    businessDescription:
      "Employee management, payroll, time tracking, and personnel administration.",
    chains: [],
  },

  // ===== APPLICATION PLATFORM AND INFRASTRUCTURE =====
  {
    area: "Application Platform and Infrastructure",
    businessDescription:
      "System configuration, integration setup, user management, and platform infrastructure.",
    chains: [],
  },

  // ===== CROSS TOPICS =====
  {
    area: "Cross Topics",
    businessDescription:
      "Cross-functional processes that span multiple business areas.",
    chains: [],
  },

  // ===== OIL AND GAS =====
  {
    area: "Oil and Gas",
    businessDescription:
      "Industry-specific processes for oil and gas exploration, production, and distribution.",
    chains: [],
  },

  // ===== PROFESSIONAL SERVICES =====
  {
    area: "Professional Services",
    businessDescription:
      "Project-based service delivery, resource management, and time & billing.",
    chains: [],
  },

  // ===== PUBLIC SECTOR =====
  {
    area: "Public Sector",
    businessDescription:
      "Government-specific processes, public funds management, and regulatory compliance.",
    chains: [],
  },

  // ===== UNCATEGORIZED =====
  {
    area: "Uncategorized",
    businessDescription:
      "Scope items not yet assigned to a specific functional area.",
    chains: [],
  },
];

// --- Known functional area names (must match database values) ---

export const KNOWN_FUNCTIONAL_AREAS = [
  "Application Platform and Infrastructure",
  "Asset Management",
  "Cross Topics",
  "Database and Data Management",
  "Enterprise Portfolio & Project Management",
  "Finance",
  "Human Resources",
  "Logistics",
  "Manufacturing",
  "Oil and Gas",
  "Organization",
  "Professional Services",
  "Public Sector",
  "Quality Management",
  "R&D/Engineering",
  "Sales",
  "Service",
  "Sourcing and Procurement",
  "Supply Chain",
  "Uncategorized",
] as const;

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

/** Find which process chain(s) a scope item belongs to (by its ID appearing as a chain step). */
export function findChainsForScopeItem(
  scopeItemId: string,
): { area: string; chain: ProcessChain }[] {
  const results: { area: string; chain: ProcessChain }[] = [];
  for (const landscape of PROCESS_LANDSCAPES) {
    for (const chain of landscape.chains) {
      if (chain.steps.some((step) => step.scopeItemId === scopeItemId)) {
        results.push({ area: landscape.area, chain });
      }
    }
  }
  return results;
}
