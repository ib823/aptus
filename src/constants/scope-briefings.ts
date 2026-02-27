/**
 * REM-33: Curated scope item briefing content.
 * For 7 key items: readable narrative explaining what the scope item covers,
 * how the review is structured, and questions to discuss before starting.
 *
 * For all other items, the ScopeItemBriefing component auto-generates
 * content from SCOPE_BUSINESS_SUMMARIES + purposeHtml + hierarchy data.
 */

// --- Types ---

export interface BriefingSection {
  heading: string;
  content: string;
}

export interface ScopeBriefing {
  sections: BriefingSection[];
  preReviewQuestions: string[];
}

// --- Curated Briefings ---

export const SCOPE_BRIEFINGS: Record<string, ScopeBriefing> = {
  // === J58: Financial Closing ===
  J58: {
    sections: [
      {
        heading: "What happens in financial closing",
        content:
          "Every month (and at year-end), your finance team needs to 'close the books' — ensuring all transactions are recorded, accounts are reconciled, and financial statements are accurate. SAP automates much of this with predefined closing cockpits, automatic postings, and validation checks.",
      },
      {
        heading: "What SAP provides",
        content:
          "A structured closing process with task lists, automatic journal entries for accruals and provisions, foreign currency revaluation, intercompany reconciliation, and balance sheet/P&L report generation. The closing cockpit tracks each task's status so nothing is missed.",
      },
      {
        heading: "What to expect in the review",
        content:
          "You'll walk through each closing step: journal entry types, reconciliation procedures, reporting configurations, and period-end processing. For each step, you'll decide if SAP's standard approach matches your current process.",
      },
      {
        heading: "Who should participate",
        content:
          "Your finance controller or chief accountant, anyone who currently runs the month-end close, and the person responsible for financial reporting. They can identify where your current process differs from SAP's standard.",
      },
    ],
    preReviewQuestions: [
      "How many days does your current month-end close take?",
      "Do you have intercompany transactions that need elimination?",
      "What financial statements do you produce (balance sheet, P&L, cash flow)?",
      "Do you use any automated reconciliation tools today?",
      "How many legal entities do you close each period?",
      "Are there any regulatory reporting requirements specific to your jurisdiction?",
    ],
  },

  // === J60: Accounts Payable ===
  J60: {
    sections: [
      {
        heading: "What happens in accounts payable",
        content:
          "When your company receives an invoice from a supplier, it needs to be matched against the purchase order and goods receipt, approved for payment, and scheduled for disbursement. SAP manages this entire flow with three-way matching, payment proposals, and automatic bank file generation.",
      },
      {
        heading: "What SAP provides",
        content:
          "Automated invoice matching (PO, goods receipt, invoice), payment scheduling with configurable terms, multiple payment methods (bank transfer, check, direct debit), dunning management for overdue items, and integration with your bank for electronic payments.",
      },
      {
        heading: "What to expect in the review",
        content:
          "You'll review the invoice entry process, matching tolerances, approval workflows, payment run configuration, and vendor master data requirements. Each step represents a decision point about how closely SAP's standard fits your process.",
      },
      {
        heading: "Who should participate",
        content:
          "Your AP manager or lead, the person who currently processes vendor invoices, and anyone involved in payment approvals. Treasury should be consulted for payment method decisions.",
      },
    ],
    preReviewQuestions: [
      "How many vendor invoices do you process per month?",
      "Do you currently use three-way matching (PO, receipt, invoice)?",
      "What payment methods do you use (bank transfer, check, other)?",
      "How often do you run payment cycles (daily, weekly, bi-weekly)?",
      "Do you have any early payment discount arrangements with vendors?",
      "How do you handle invoice exceptions or discrepancies today?",
    ],
  },

  // === J59: Accounts Receivable ===
  J59: {
    sections: [
      {
        heading: "What happens in accounts receivable",
        content:
          "When your company sells goods or services, you need to generate invoices, track customer payments, manage outstanding balances, and follow up on overdue accounts. SAP automates invoice generation from sales orders and provides structured dunning processes.",
      },
      {
        heading: "What SAP provides",
        content:
          "Automatic invoice creation from sales orders, flexible payment term management, dunning (payment reminder) configuration with multiple escalation levels, credit management to control customer exposure, and automatic clearing of incoming payments against open items.",
      },
      {
        heading: "What to expect in the review",
        content:
          "You'll walk through billing document creation, payment processing, account clearing rules, dunning procedures, credit limit management, and customer master data requirements.",
      },
      {
        heading: "Who should participate",
        content:
          "Your AR manager, credit controller, and the team that handles customer billing and collections. Sales leadership should weigh in on credit management policies.",
      },
    ],
    preReviewQuestions: [
      "How many customer invoices do you generate per month?",
      "What payment terms do you typically offer customers?",
      "Do you currently have a structured dunning (collections) process?",
      "Do you manage customer credit limits today? If so, how?",
      "What percentage of your receivables are typically overdue?",
      "How do you handle partial payments or payment on account?",
    ],
  },

  // === 1EG: Bank Statement Integration ===
  "1EG": {
    sections: [
      {
        heading: "What happens in bank integration",
        content:
          "Your bank sends daily electronic statements listing all transactions (payments received, payments made, fees, interest). SAP imports these files and automatically matches each transaction against your accounting records, flagging anything that doesn't match for manual review.",
      },
      {
        heading: "What SAP provides",
        content:
          "Support for standard bank file formats (MT940, MT942, camt.053), automatic matching rules that learn from your patterns, manual clearing workbench for exceptions, and real-time cash position visibility across all bank accounts.",
      },
      {
        heading: "What to expect in the review",
        content:
          "You'll review bank communication setup, statement import formats, automatic matching rules, exception handling workflows, and reconciliation procedures.",
      },
      {
        heading: "Who should participate",
        content:
          "Your treasury team or the person responsible for bank reconciliation, plus your IT team for technical bank connectivity setup.",
      },
    ],
    preReviewQuestions: [
      "How many bank accounts does your company manage?",
      "What format do your banks use for electronic statements?",
      "How often do you reconcile bank statements (daily, weekly)?",
      "What percentage of bank transactions can you automatically match today?",
      "Do you use any cash pooling or zero-balancing arrangements?",
    ],
  },

  // === J14: End-to-End Procurement ===
  J14: {
    sections: [
      {
        heading: "What happens in procurement",
        content:
          "When someone in your company needs to buy something — from raw materials to office furniture — a series of steps kicks off: request, approval, supplier selection, purchase order, receiving the goods, and paying the invoice. SAP connects all these steps into one traceable flow.",
      },
      {
        heading: "What SAP provides",
        content:
          "A complete procurement workflow: purchase requisitions with configurable approval chains, automatic PO creation, goods receipt processing, invoice verification with three-way matching, and full audit trail from need to payment.",
      },
      {
        heading: "What to expect in the review",
        content:
          "You'll walk through each procurement stage: how requests are created, approval thresholds, PO types, goods receipt procedures, invoice matching tolerances, and reporting. The review covers both direct (production) and indirect (office) purchasing.",
      },
      {
        heading: "Who should participate",
        content:
          "Your procurement manager, the person who approves purchase orders, warehouse receiving staff, and AP for the invoice side. Anyone who regularly creates purchase requests should also be consulted.",
      },
    ],
    preReviewQuestions: [
      "How many purchase orders does your company create per month?",
      "What approval thresholds exist for purchasing decisions?",
      "Do you distinguish between direct (production) and indirect purchasing?",
      "How do you currently track goods receipts?",
      "Do you use any supplier portals or electronic ordering today?",
    ],
  },

  // === BNX: Consumables Purchasing ===
  BNX: {
    sections: [
      {
        heading: "What this covers",
        content:
          "Purchasing non-inventory items that your company consumes regularly — office supplies, cleaning materials, maintenance parts, and other goods that are used rather than resold. This is simpler than full procurement because there's no inventory tracking involved.",
      },
      {
        heading: "What SAP provides",
        content:
          "Simplified purchasing with pre-approved catalogs, shopping cart functionality for end users, automatic account assignment (which cost center to charge), and streamlined approval workflows for low-value purchases.",
      },
    ],
    preReviewQuestions: [
      "What types of consumable items does your company purchase regularly?",
      "Do you have preferred suppliers or catalogs for standard items?",
      "What approval limits exist for consumable purchases?",
    ],
  },

  // === BKP: Sales Order Processing ===
  BKP: {
    sections: [
      {
        heading: "What happens in sales order processing",
        content:
          "When a customer places an order, your company needs to check product availability, confirm pricing, schedule delivery, ship the goods, and generate an invoice. SAP manages this entire flow with real-time inventory checks and automatic document generation.",
      },
      {
        heading: "What SAP provides",
        content:
          "End-to-end order management: quotation creation, order entry with availability check, delivery scheduling, picking and packing, goods issue, and billing document generation. Pricing is highly configurable with condition records for discounts, surcharges, and taxes.",
      },
      {
        heading: "What to expect in the review",
        content:
          "You'll review the complete order-to-cash cycle: how orders are entered, pricing determination, availability checks, delivery processing, and billing. Each step has SAP's standard approach that you'll compare against your current process.",
      },
    ],
    preReviewQuestions: [
      "How many sales orders does your company process per month?",
      "Do you offer customer-specific pricing or standard price lists?",
      "What delivery options do you offer (standard, express, pickup)?",
      "How do you handle backorders or partial deliveries?",
    ],
  },
};

// --- Helper ---

/** Get the curated briefing for a scope item, or null if no curated content exists. */
export function getScopeBriefing(scopeItemId: string): ScopeBriefing | null {
  return SCOPE_BRIEFINGS[scopeItemId] ?? null;
}
