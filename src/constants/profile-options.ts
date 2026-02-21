/** Profile option constants for Phase 10 Company Profile Enrichment */

export const CURRENCY_CODES = [
  "USD", "EUR", "GBP", "JPY", "CNY", "AUD", "CAD", "CHF", "HKD", "SGD",
  "MYR", "INR", "KRW", "THB", "IDR", "PHP", "TWD", "BRL", "MXN", "ZAR",
  "AED", "SAR", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "NZD", "ILS",
] as const;

export const LANGUAGE_CODES = [
  "EN", "ZH", "ES", "FR", "DE", "JA", "KO", "PT", "AR", "HI",
  "MS", "TH", "ID", "VI", "IT", "NL", "PL", "TR", "SV", "DA",
] as const;

export const SAP_MODULES = [
  { code: "FI", label: "Financial Accounting" },
  { code: "CO", label: "Controlling" },
  { code: "MM", label: "Materials Management" },
  { code: "SD", label: "Sales & Distribution" },
  { code: "PP", label: "Production Planning" },
  { code: "PM", label: "Plant Maintenance" },
  { code: "QM", label: "Quality Management" },
  { code: "PS", label: "Project System" },
  { code: "WM", label: "Warehouse Management" },
  { code: "HR", label: "Human Resources" },
  { code: "AM", label: "Asset Management" },
  { code: "CS", label: "Customer Service" },
  { code: "LE", label: "Logistics Execution" },
  { code: "EWM", label: "Extended Warehouse Management" },
  { code: "TM", label: "Transportation Management" },
  { code: "RE", label: "Real Estate" },
  { code: "GTS", label: "Global Trade Services" },
  { code: "SRM", label: "Supplier Relationship Management" },
] as const;

export const DEPLOYMENT_MODELS = [
  { value: "public_cloud", label: "Public Cloud (Multi-tenant)" },
  { value: "private_cloud", label: "Private Cloud (Single-tenant)" },
  { value: "hybrid", label: "Hybrid Cloud" },
] as const;

export const MIGRATION_APPROACHES = [
  { value: "greenfield", label: "Greenfield (New Implementation)" },
  { value: "brownfield", label: "Brownfield (System Conversion)" },
  { value: "selective", label: "Selective Data Transition" },
] as const;

export const REGULATORY_FRAMEWORKS = [
  "SOX", "GDPR", "HIPAA", "PCI-DSS", "ISO-27001", "SOC-2",
  "IFRS", "US-GAAP", "GST", "VAT", "ITAR", "EAR",
  "CCPA", "PDPA", "LGPD", "PIPL",
] as const;

export const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export const COMPLEXITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export const RISK_CATEGORY_OPTIONS = [
  { value: "technical", label: "Technical" },
  { value: "business", label: "Business" },
  { value: "compliance", label: "Compliance" },
  { value: "integration", label: "Integration" },
] as const;

export const UPGRADE_STRATEGY_OPTIONS = [
  { value: "standard_upgrade", label: "Standard Upgrade" },
  { value: "needs_revalidation", label: "Needs Revalidation" },
  { value: "custom_maintenance", label: "Custom Maintenance" },
] as const;

export const CONFIDENCE_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;
