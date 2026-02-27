/**
 * Plain-English business summaries for scope items.
 * Written for: business process owners who have never used SAP.
 * Max 2-3 sentences. No SAP jargon. Explain WHAT and WHY, not HOW.
 *
 * REM-19 + REM-23: Single source of truth for scope item descriptions.
 * Use getFirstSentence() for short versions (scope selection page).
 * Use the full text for detailed views (review summary card).
 */
export const SCOPE_BUSINESS_SUMMARIES: Record<string, string> = {
  // === FINANCE ===
  J58: "This covers your month-end and year-end financial closing process — posting journal entries, running the trial balance, reconciling accounts, and generating financial statements. If your company produces financial reports on a regular schedule, this is relevant to you.",
  J60: "This covers accounts payable — processing invoices from your vendors/suppliers, scheduling payments, and tracking what your company owes. If you pay suppliers for goods or services, this is relevant.",
  J59: "This covers accounts receivable — sending invoices to your customers, tracking payments received, and managing outstanding balances. If your company bills customers, this is relevant.",
  "1EG": "This covers electronic bank statement integration — automatically importing bank transaction files (MT940/MT942/camt.053 formats) from your bank into SAP to match against your accounting records. If your company receives bank statements electronically, this is relevant.",
  BFB: "This covers petty cash management and daily bank reconciliation — handling small cash transactions and ensuring your bank balance matches your accounting records.",
  "1EZ": "This covers credit memo processing — creating credit notes when you need to reverse or adjust a customer invoice, for example due to returns, pricing errors, or service credits.",
  J58A: "This covers intercompany financial transactions and reconciliation between your legal entities. If your company has multiple subsidiaries that transact with each other, this is relevant.",
  J77: "This covers fixed asset management — tracking acquisition, depreciation, retirement, and transfers of your company's physical assets like buildings, equipment, and vehicles.",
  "2NV": "This covers revenue recognition and accounting for customer contracts per IFRS 15. If your company needs to recognize revenue over time or across multiple performance obligations, this is relevant.",
  J61: "This covers treasury and cash management — forecasting cash flows, managing bank accounts, and ensuring your company has sufficient liquidity.",
  J63: "This covers cost center accounting and internal cost allocation — tracking expenses by department and distributing shared costs across your organization.",

  // === PROCUREMENT ===
  BNX: "This covers purchasing of consumable items — office supplies, maintenance materials, and other non-inventory goods your company buys regularly. If your teams order supplies through any kind of purchasing process, this is relevant.",
  J14: "This covers the end-to-end procurement cycle — from creating a purchase request when someone needs something, through getting approvals, creating the purchase order, receiving the goods, and processing the supplier's invoice.",
  BD2: "This covers employee expense management — submitting travel requests, booking trips, submitting expense claims with receipts, and getting reimbursed.",
  "1FC": "This covers standard purchase order processing for goods and services — creating, approving, and sending orders to your suppliers.",
  BNL: "This covers sourcing and supplier evaluation — sending requests for quotation, comparing bids, and selecting the best vendor for your needs.",

  // === SALES ===
  BKP: "This covers the complete sales order process — from receiving a customer order, checking product availability, scheduling delivery, shipping the goods, and generating the invoice.",
  J56: "This covers outbound delivery and inventory management — stock movements, physical counting, warehouse transfers, and shipping goods to customers.",
  BEF: "This covers customer returns, refunds, and exchanges — processing reverse logistics when customers send goods back.",

  // === WAREHOUSE ===
  J45: "This covers warehouse operations — receiving goods into your warehouse, putting them away in storage locations, picking them for orders, and tracking stock movements.",
  "1YB": "This covers basic warehouse management — goods receipt, put-away, picking, and shipping operations within your storage facilities.",

  // === PRODUCTION ===
  J44: "This covers production planning — scheduling what to produce, when to produce it, and what materials are needed. If your company manufactures products, this is relevant.",
  J46: "This covers bill of materials management — creating and maintaining product structures that define what components go into each finished product.",

  // === QUALITY ===
  BD6: "This covers quality management — inspections, test plans, and quality certificates that ensure your products meet required standards.",

  // === MAINTENANCE ===
  BHR: "This covers plant maintenance — work orders, preventive maintenance schedules, and equipment tracking to keep your physical assets running.",

  // === SERVICES ===
  BKC: "This covers service order management — creating, scheduling, and completing service requests for your customers or internal departments.",

  // === PROJECT ===
  BJ5: "This covers project management — work breakdown structures, budgeting, and cost tracking for your company's projects.",

  // === MASTER DATA ===
  BMD: "This covers master data governance — creating and maintaining business partner records (customers, vendors, employees) that are used across all business processes.",
};

/** Get the first sentence of a scope item's business summary (for compact views) */
export function getFirstSentence(scopeItemId: string): string | null {
  const full = SCOPE_BUSINESS_SUMMARIES[scopeItemId];
  if (!full) return null;
  const firstDot = full.indexOf(".");
  return firstDot > 0 ? full.slice(0, firstDot + 1) : full;
}
