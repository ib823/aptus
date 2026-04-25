/** Hardcoded assessment presets — no database dependency */

export interface PresetScopeItem {
  id: string;
  name: string;
  description: string;
  totalSteps: number;
  effortScore: number;
  effortTier: string;
  /** Whether this scope item is selected by default in the preset */
  defaultSelected: boolean;
}

export interface Preset {
  name: string;
  description: string;
  scopeItems: PresetScopeItem[];
  modules: string[];
}

export const PRESETS: Record<string, Preset> = {
  coreedge: {
    name: "Aptus CoreEdge",
    description:
      "Essential finance processes for a single legal entity — accounting, payables, assets, and banking.",
    scopeItems: [
      // ─── Default (pre-selected) ───
      {
        id: "J58",
        name: "Accounting and Financial Close",
        description: "Month-end/year-end financial close: journals, reconciliations, valuation, reclassification, and financial statements.",
        totalSteps: 710,
        effortScore: 479,
        effortTier: "Very High",
        defaultSelected: true,
      },
      {
        id: "J60",
        name: "Accounts Payable",
        description: "Accounts payable: supplier invoice processing, payment run/approval, payment media, down payments, and AP reporting.",
        totalSteps: 714,
        effortScore: 221,
        effortTier: "High",
        defaultSelected: true,
      },
      {
        id: "BFA",
        name: "Basic Bank Account Management",
        description: "Bank account lifecycle management: create/change/close bank accounts, bank master and bank G/L setup, and bank chain maintenance.",
        totalSteps: 319,
        effortScore: 80,
        effortTier: "Medium",
        defaultSelected: true,
      },
      {
        id: "J62",
        name: "Asset Accounting",
        description: "Asset accounting: fixed asset lifecycle from acquisition through depreciation, transfer, retirement, and reporting.",
        totalSteps: 330,
        effortScore: 131,
        effortTier: "Medium",
        defaultSelected: true,
      },
      // ─── Optional (available to add) ───
      {
        id: "BFB",
        name: "Basic Cash Operations",
        description: "Daily cash operations: cash position, bank statement handling, memo records, value date correction, and cash tools.",
        totalSteps: 323,
        effortScore: 88,
        effortTier: "Medium",
        defaultSelected: false,
      },
      {
        id: "1EG",
        name: "Bank Integration with File Interface",
        description: "Bank integration via file interface: generate outgoing payment files and import incoming bank statements for reconciliation.",
        totalSteps: 101,
        effortScore: 53,
        effortTier: "Low",
        defaultSelected: false,
      },
      {
        id: "J54",
        name: "Overhead Cost Accounting",
        description: "Overhead cost accounting: cost center planning/posting, internal allocations, and period-end overhead analysis.",
        totalSteps: 179,
        effortScore: 50,
        effortTier: "Low",
        defaultSelected: false,
      },
    ],
    modules: ["FI", "CO"],
  },
};

export type PresetKey = keyof typeof PRESETS;
