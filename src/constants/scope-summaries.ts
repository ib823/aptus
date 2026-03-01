/**
 * Plain-English business summaries for scope items.
 * Written for: business process owners who have never used SAP.
 * Max 2-3 sentences. No SAP jargon. Explain WHAT and WHY, not HOW.
 *
 * REM-19 + REM-23: Single source of truth for scope item descriptions.
 * Use getFirstSentence() for short versions (scope selection page).
 * Use the full text for detailed views (review summary card).
 *
 * IMPORTANT: IDs must match the actual ScopeItem records in the database.
 * Verify against the scope selection page before adding new entries.
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
  J62: "This covers fixed asset management — tracking acquisition, depreciation, retirement, and transfers of your company's physical assets like buildings, equipment, and vehicles.",
  J61: "This covers treasury and cash management — forecasting cash flows, managing bank accounts, and ensuring your company has sufficient liquidity.",
  J63: "This covers cost center accounting and internal cost allocation — tracking expenses by department and distributing shared costs across your organization.",

  // === PROCUREMENT ===
  BNX: "This covers purchasing of consumable items — office supplies, maintenance materials, and other non-inventory goods your company buys regularly. If your teams order supplies through any kind of purchasing process, this is relevant.",
  J45: "This covers the end-to-end procurement cycle — from creating a purchase request when someone needs something, through getting approvals, creating the purchase order, receiving the goods, and processing the supplier's invoice.",
  BMD: "This covers purchase contracts — establishing long-term agreements with your suppliers for recurring purchases, including negotiated prices, quantities, and delivery schedules.",

  // === SALES ===
  BKP: "This covers the complete sales order process — from receiving a customer order, checking product availability, scheduling delivery, shipping the goods, and generating the invoice.",
  J56: "This covers outbound delivery and inventory management — stock movements, physical counting, warehouse transfers, and shipping goods to customers.",
  BEF: "This covers customer returns, refunds, and exchanges — processing reverse logistics when customers send goods back.",
  "2ET": "This covers sales order processing for non-stock materials — handling orders for items that are not kept in inventory, such as services, consumables, or drop-ship products.",
  BDW: "This covers returnables processing — tracking returnable transport packaging like pallets and containers through the sales and delivery cycle.",

  // === WAREHOUSE & INVENTORY ===
  BMC: "This covers core inventory management — tracking stock levels, managing goods receipts and issues, and maintaining accurate inventory records across your storage locations.",

  // === PRODUCTION ===
  J44: "This covers production planning — scheduling what to produce, when to produce it, and what materials are needed. If your company manufactures products, this is relevant.",
  BJ5: "This covers make-to-stock discrete manufacturing — producing finished goods to stock based on planned orders, including shop floor execution, confirmations, and goods receipt.",

  // === PROJECT ===
  "1NT": "This covers project financial control — work breakdown structures, budgeting, cost tracking, and period-end settlement for your company's projects.",

  // === MASTER DATA ===
  "1N3": "This covers master data consolidation for business partners — deduplicating and merging customer, vendor, and employee records to ensure data consistency across your organization.",
  "1RK": "This covers mass loading and maintenance of business partner records — bulk creation and updates of customer, vendor, and contact information.",
  "1RM": "This covers mass loading and maintenance of product master data — bulk creation and updates of material records including descriptions, units of measure, and classifications.",
};

/** Get the first sentence of a scope item's business summary (for compact views) */
export function getFirstSentence(scopeItemId: string): string | null {
  const full = SCOPE_BUSINESS_SUMMARIES[scopeItemId];
  if (!full) return null;
  const firstDot = full.indexOf(".");
  return firstDot > 0 ? full.slice(0, firstDot + 1) : full;
}
