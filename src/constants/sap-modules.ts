export const SAP_MODULE_NAMES: Record<string, string> = {
  FI: "Financial Accounting",
  CO: "Controlling (Management Accounting)",
  MM: "Materials Management (Procurement)",
  SD: "Sales & Distribution",
  PP: "Production Planning",
  PM: "Plant Maintenance",
  QM: "Quality Management",
  PS: "Project System",
  WM: "Warehouse Management",
  EWM: "Extended Warehouse Management",
  HCM: "Human Capital Management",
  HR: "Human Resources",
  IM: "Investment Management",
  TR: "Treasury",
  RE: "Real Estate",
  CS: "Customer Service",
  AM: "Asset Management",
  AA: "Asset Accounting",
  GL: "General Ledger",
  AP: "Accounts Payable",
  AR: "Accounts Receivable",
  TM: "Transportation Management",
  LE: "Logistics Execution",
  SRM: "Supplier Relationship Management",
  CRM: "Customer Relationship Management",
  BW: "Business Warehouse / Analytics",
  GRC: "Governance, Risk & Compliance",
  IBP: "Integrated Business Planning",
  S4: "SAP Core",
  GTS: "Global Trade Services",
};

export function getModuleFullName(code: string): string {
  return SAP_MODULE_NAMES[code.toUpperCase()] ?? code;
}

export function getModuleLabel(code: string): string {
  const name = SAP_MODULE_NAMES[code.toUpperCase()];
  return name ? `${code.toUpperCase()} — ${name}` : code.toUpperCase();
}
