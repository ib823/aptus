/**
 * Plain-English descriptions for common SAP activity titles.
 * These appear as tooltips on activity cards in the Process Map.
 * Key = exact activity title from SAP catalog (case-sensitive).
 */
export const ACTIVITY_DESCRIPTIONS: Record<string, string> = {
  // Bank Integration activities
  "MT942 Format": "SWIFT standard for intraday bank statement reporting \u2014 your bank sends transactions in this format",
  "camt.053 Format": "ISO 20022 standard for end-of-day bank statements \u2014 the newer replacement for MT940",
  "pain.002 Format": "ISO 20022 payment status report \u2014 confirms whether your payment instructions were accepted by the bank",
  "MT940 Format": "SWIFT standard for end-of-day bank account statements \u2014 the most widely used bank statement format",
  "Display Bank Statement": "View imported bank statements and their matching status in SAP",
  "Outgoing Integration": "Sending payment files from SAP to your bank for processing",
  "Incoming Integration": "Receiving bank statement files from your bank into SAP",
  "Additional Information: Preliminary Activities": "One-time setup steps required before the main process can run",
  "Additional Information: Company-Specific Settings": "Configuration specific to your company's setup",
  "Additional Information: General Settings": "Shared configuration that applies across your organization",

  // Financial Close activities
  "Period-End Closing": "Month-end or year-end procedures to finalize your financial records for the period",
  "Financial Statements": "Generating balance sheet, income statement, and cash flow reports",
  "Intercompany Reconciliation": "Matching and eliminating transactions between your company's entities",
  "Asset Depreciation": "Calculating and posting the reduction in value of your company's fixed assets",
  "Foreign Currency Valuation": "Recalculating balances in foreign currencies at current exchange rates",

  // Procurement activities
  "Create Purchase Requisition": "Requesting approval to buy goods or services",
  "Create Purchase Order": "Formal order sent to a supplier to buy goods or services",
  "Goods Receipt": "Recording that ordered goods have physically arrived at your location",
  "Invoice Verification": "Checking that a supplier's invoice matches the purchase order and goods received",
  "Payment Processing": "Executing the actual payment to the supplier",

  // Sales activities
  "Create Sales Order": "Creating a customer order to track what they want to buy",
  "Create Delivery": "Scheduling and preparing goods for shipment to the customer",
  "Create Billing Document": "Generating the invoice to send to the customer",
};

export function getActivityDescription(title: string): string | null {
  return ACTIVITY_DESCRIPTIONS[title] ?? null;
}
