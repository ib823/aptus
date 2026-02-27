/** Plain-English descriptions for scope items that a non-SAP user can understand */
export const SCOPE_PLAIN_DESCRIPTIONS: Record<string, string> = {
  J58: "Month-end and year-end closing of financial books, including journal entries and trial balance",
  J60: "Processing vendor invoices, managing payments to suppliers, and tracking what you owe",
  J59: "Tracking customer invoices, receiving payments, and managing what customers owe you",
  "1EG": "Connecting your bank statements to SAP so transactions are automatically matched",
  BNX: "Purchasing office supplies, consumables, and other non-inventory items",
  "1EZ": "Creating credit notes when you need to reverse or adjust a customer invoice",
  BFB: "Managing petty cash and daily bank reconciliations",
  J14: "End-to-end procurement process from purchase request to goods receipt",
  BD2: "Managing employee travel requests, bookings, and expense reimbursements",
  J58A: "Intercompany financial transactions and reconciliation between legal entities",
  J77: "Managing fixed assets — acquisition, depreciation, retirement, and transfers",
  "2NV": "Revenue recognition and accounting for customer contracts per IFRS 15",
  BEF: "Managing customer returns, refunds, and exchanges",
  J61: "Treasury and cash management, including cash flow forecasting",
  BKP: "Sales order processing from quotation through delivery and billing",
  J56: "Managing inventory — stock movements, physical counting, and warehouse transfers",
  BD6: "Quality management including inspections, test plans, and certificates",
  J45: "Production planning and scheduling — MRP, capacity planning, and work orders",
  "1YB": "Basic warehouse management — goods receipt, put-away, picking, and shipping",
  BJ5: "Project management — WBS elements, budgeting, and cost tracking",
  "1FC": "Standard purchase order processing for goods and services",
  J46: "Bill of materials management — creating and maintaining product structures",
  BNL: "Sourcing and supplier evaluation — RFQs, bid comparison, and vendor selection",
  BHR: "Plant maintenance — work orders, preventive maintenance, and equipment tracking",
  BKC: "Service order management — create, schedule, and complete service requests",
  BMD: "Master data governance — creating and maintaining business partner records",
  J63: "Cost center accounting and internal cost allocation",
};

export function getScopePlainDescription(scopeItemId: string): string | null {
  return SCOPE_PLAIN_DESCRIPTIONS[scopeItemId] ?? null;
}
