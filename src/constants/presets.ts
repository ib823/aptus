/** Hardcoded assessment presets — no database dependency */

export const PRESETS = {
  coreedge: {
    name: "ABeam CoreEdge",
    description:
      "Basic finance and non-stock procurement for a single legal entity",
    scopeItemIds: [
      "J58", // General Ledger
      "J60", // Accounts Payable
      "J59", // Accounts Receivable
      "1EG", // Asset Accounting
      "BNX", // Bank Account Management
      "J77", // Closing Operations
      "J63", // Cost Center Accounting
      "BFB", // Profit Center Accounting
      "BMD", // Master Data Governance
    ],
    modules: ["FI", "CO"],
  },
} as const;

export type PresetKey = keyof typeof PRESETS;
