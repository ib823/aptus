/**
 * Generates a business-context hint for a step, helping non-SAP users
 * understand what they're being asked to classify.
 *
 * Returns a plain-English guidance sentence that reframes the SAP step
 * as a business question.
 */

const KEYWORD_HINTS: Array<{ pattern: RegExp; hint: string | null }> = [
  { pattern: /import.*bank\s*statement/i, hint: "If your company receives electronic bank statements from your bank (e.g., daily CSV or MT940 files), this step handles importing them automatically. If you reconcile bank statements manually, select \u2018Not applicable.\u2019" },
  { pattern: /create.*purchase\s*(order|requisition)/i, hint: "This step is about how purchase requests are created in your company. Think about: do your staff submit purchase requests? Is there an approval workflow? Do you have spending limits?" },
  { pattern: /goods\s*receipt/i, hint: "This step records when ordered goods physically arrive at your location. Think about: does someone in your warehouse check deliveries against orders? Do you use a system to track this?" },
  { pattern: /invoice\s*(verification|receipt|processing)/i, hint: "This step is about processing supplier invoices. Think about: how do invoices arrive (email, paper, portal)? Who checks them against the purchase order? How long does approval take?" },
  { pattern: /payment\s*(run|processing|execution)/i, hint: "This step executes payments to your suppliers. Think about: how often do you pay suppliers (weekly, monthly)? Do you use bank transfers, checks, or other methods?" },
  { pattern: /journal\s*entry/i, hint: "This step is about recording financial transactions in your books. Think about: who posts journal entries? Are there approval requirements? Do you post adjustments at month-end?" },
  { pattern: /period[- ]end\s*clos/i, hint: "This step is part of your month-end or year-end closing process. Think about: what activities does your finance team perform to close the books each month?" },
  { pattern: /financial\s*statement/i, hint: "This step generates your financial reports (balance sheet, profit & loss). Think about: what reports does your management require? How often?" },
  { pattern: /credit\s*memo/i, hint: "This step handles issuing credit notes to customers \u2014 for example, when goods are returned or a pricing error occurred. Does your company issue credit memos?" },
  { pattern: /dunning/i, hint: "This step sends payment reminders to customers who haven't paid on time. Think about: does your company send overdue payment notices? How many reminder levels?" },
  { pattern: /depreciation/i, hint: "This step calculates how much value your company's fixed assets (buildings, equipment, vehicles) have lost over time. Think about: do you track asset values and run depreciation?" },
  { pattern: /foreign\s*currency/i, hint: "This step revalues balances held in foreign currencies at current exchange rates. Think about: does your company hold balances in currencies other than your local currency?" },
  { pattern: /intercompany/i, hint: "This step handles transactions between different entities within your company group. Think about: do you buy/sell between your own subsidiaries?" },
  { pattern: /sales\s*order/i, hint: "This step creates a customer order in the system. Think about: how do customer orders come in (phone, email, web portal)? What information is captured?" },
  { pattern: /delivery/i, hint: "This step handles shipping goods to customers. Think about: how are deliveries scheduled? Do you use a logistics provider? Do you track shipments?" },
  { pattern: /logon|log on|access app/i, hint: null },
  { pattern: /navigate|navigation/i, hint: null },
];

const CATEGORY_FALLBACKS: Record<string, string> = {
  BUSINESS_PROCESS: "Review the description below. Does your company have a similar process? If yes, select \u2018This matches our process.\u2019 If your company does this differently, select \u2018Our process is different\u2019 and describe how.",
  CONFIGURATION: "This is a system setting that controls how SAP behaves. Review what it does and decide whether the standard setting works for your company or needs to be changed.",
  REPORTING: "This is a standard SAP report. Think about: does your company need this report? Is the information shown relevant to your business?",
  MASTER_DATA: "This is about maintaining reference data (e.g., customer records, product catalogs). Think about: how does your company manage this type of master data today?",
};

export function getBusinessContextHint(
  actionTitle: string,
  stepCategory: string | null | undefined,
): string | null {
  for (const { pattern, hint } of KEYWORD_HINTS) {
    if (pattern.test(actionTitle)) {
      return hint;
    }
  }

  if (stepCategory && CATEGORY_FALLBACKS[stepCategory]) {
    return CATEGORY_FALLBACKS[stepCategory]!;
  }

  return "Review the SAP process step described below. Compare it to how your company handles this today. Select the option that best matches your situation.";
}
