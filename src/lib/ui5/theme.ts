/**
 * SAP Horizon theme constants and color token utilities.
 */

export const SAP_THEMES = {
  HORIZON: "sap_horizon",
  HORIZON_DARK: "sap_horizon_dark",
  HORIZON_HCB: "sap_horizon_hcb",
  HORIZON_HCW: "sap_horizon_hcw",
} as const;

export type SapTheme = (typeof SAP_THEMES)[keyof typeof SAP_THEMES];

/** SAP semantic status color mappings for business classification statuses. */
export const STATUS_TO_SAP_SEMANTIC = {
  FIT: { color: "Positive", bg: "var(--sapPositiveBackground)", fg: "var(--sapPositiveColor)" },
  CONFIGURE: { color: "Information", bg: "var(--sapInformativeBackground)", fg: "var(--sapInformativeColor)" },
  GAP: { color: "Negative", bg: "var(--sapNegativeBackground)", fg: "var(--sapNegativeColor)" },
  EXTEND: { color: "Critical", bg: "var(--sapCriticalBackground)", fg: "var(--sapCriticalColor)" },
  BUILD: { color: "Negative", bg: "var(--sapNegativeBackground)", fg: "var(--sapNegativeColor)" },
  ADAPT: { color: "None", bg: "var(--sapAccentBackground7, var(--status-adapt-bg))", fg: "var(--sapAccentColor7, var(--status-adapt-fg))" },
  PENDING: { color: "None", bg: "var(--sapNeutralBackground)", fg: "var(--sapNeutralColor)" },
  NA: { color: "None", bg: "var(--sapNeutralBackground)", fg: "var(--sapNeutralColor)" },
} as const;

export type ClassificationStatus = keyof typeof STATUS_TO_SAP_SEMANTIC;
