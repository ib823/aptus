# ABEAM V2 — Round 3 Remediation: The Department Head's 15-Minute Path

> **The core problem**: A Head of Finance opens ABEAM, sees 15 SAP codes with step counts, has no idea what SAP covers for their area, how the pieces connect, or what any of it means in business terms. They close the tab.

> **The fix**: Two layers that don't exist yet. Layer 1 shows the business process landscape at functional-area level (cross-scope). Layer 2 shows a readable process briefing at scope-item level (within-scope). Together they let a department head understand and complete scope selection in 15 minutes.

---

## Current State Assessment

| What exists | What it does | Why it fails the department head |
|---|---|---|
| Scope selection flat list | Shows 550 items grouped by functional area with checkboxes | No process context. Just code names and step counts. |
| `SCOPE_BUSINESS_SUMMARIES` | 2-3 sentence descriptions per scope item | Only visible AFTER entering review, not during scope selection. No cross-item relationships. |
| `ScopeItemSummary` (REM-19) | Stats card above activity grid in review view | Navigation aid, not orientation. Shows "16 activities, 55 classifiable" — meaningless without process context. |
| `ScopeFlowOverview` (REM-15) | Horizontal flow boxes showing activity progress in review | Navigation aid for answering the assessment, not for understanding the business process. |
| `ProcessMap` / `ProcessMapCanvas` | SVG grid of activities within a scope item | Shows activity cards in a flat grid. No sequence logic. No business meaning. |
| `purposeHtml` / `overviewHtml` on ScopeItem | Raw SAP documentation from BPD DOCX files | Written for consultants. Full of SAP jargon. Not surfaced in a readable way. |
| `SolutionProcess → ProcessFlow → Activity` hierarchy | Internal process structure per scope item | Data exists in DB but is only used for navigation (sidebar tree + activity grid). Never presented as a readable process story. |

**Nothing in the tool answers**: "What does SAP cover for Finance? How do the pieces fit together? Where should I focus?"

---

## The 15-Minute Journey (Target State)

```
MINUTE 0-1: Head of Finance opens Scope Selection
┌─────────────────────────────────────────────────────────────┐
│  [Process Map View]  [List View]                            │
│                                                             │
│  FINANCE — Business Process Landscape                       │
│  "Finance in SAP covers everything from recording daily     │
│  transactions to producing financial statements..."         │
│                                                             │
│  ┌─ RECORD TO REPORT (R2R) ─────────────── Core ─┐        │
│  │  Journal    →  General   →  Period   →  Financial│        │
│  │  Entries       Ledger       Close       Statements│       │
│  │  (J58) ☑      (J58) ☑     (J58) ☑    (J58) ☑   │        │
│  │       ↘ Cost Allocation (J63) ☐                  │        │
│  │       ↘ Intercompany Recon (J58A) ☐              │        │
│  │       ↘ Revenue Recognition (2NV) ☐              │        │
│  └───────────────────────────────────────────────────┘       │
│                                                              │
│  ┌─ PROCURE TO PAY (P2P) ──────────────── Core ──┐         │
│  │  Sourcing  →  Purchase  →  Goods   →  Invoice  │         │
│  │  & RFQ        Order        Receipt    Verif.    │         │
│  │  (BNL) ☐     (1FC) ☐     (J14) ☐   (J60) ☐   │         │
│  │                                      → Payment  │         │
│  │                                        Run      │         │
│  │                                       (J60) ☐   │         │
│  └──────────────────────────────────────────────────┘        │
│  ... Treasury, Asset Mgmt, O2C chains ...                    │
│                                                              │
│  [Select Entire R2R Chain]  [Select Entire P2P Chain]        │
│  Summary: 3/15 selected · R2R partial · P2P not started      │
└──────────────────────────────────────────────────────────────┘

MINUTE 1-5: Department head reads chain descriptions, clicks 
"Select Entire Chain" for R2R and P2P. Skips Assets. Done.

MINUTE 5-8: Clicks into J58 to see what's involved.
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Scope Selection                                  │
│                                                              │
│  ACCOUNTING & FINANCIAL CLOSE (J58)                          │
│  ─────────────────────────────────────────                   │
│  WHAT THIS COVERS                                            │
│  Your end-to-end financial closing process. In SAP, this     │
│  scope item handles:                                         │
│                                                              │
│  Daily Operations                                            │
│    Post journal entries · Process recurring entries ·         │
│    Record accruals and deferrals                             │
│                                                              │
│  Monthly Close                                               │
│    Run the closing cockpit · Reconcile subledgers ·          │
│    Revalue foreign currency balances · Run depreciation ·    │
│    Generate trial balance                                    │
│                                                              │
│  Period-End Reporting                                        │
│    Produce balance sheet · Income statement ·                │
│    Cash flow statement · Segment reporting                   │
│                                                              │
│  HOW THE REVIEW WORKS                                        │
│  This has 710 total steps, but only 350 need your input.     │
│  They're organized into 5 process areas:                     │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ Journal Entry │→│ Period Close  │→│ Financial    │        │
│  │ Processing    │ │ Procedures   │ │ Reporting    │        │
│  │ 89 steps      │ │ 134 steps    │ │ 67 steps     │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│  ┌──────────────┐ ┌──────────────┐                          │
│  │ Intercompany │ │ Configuration│                          │
│  │ Processing   │ │ & Setup      │                          │
│  │ 45 steps     │ │ 15 steps     │                          │
│  └──────────────┘ └──────────────┘                          │
│                                                              │
│  QUESTIONS TO ASK YOUR TEAM                                  │
│  Before the detailed review, consider:                       │
│  · Do you close monthly or quarterly?                        │
│  · Do you have intercompany transactions?                    │
│  · What financial reports does management require?           │
│  · Do you hold balances in foreign currencies?               │
│                                                              │
│  [Start Detailed Review →]  [Back to Scope Selection]        │
└──────────────────────────────────────────────────────────────┘

MINUTE 8-10: Department head reads the briefing, understands 
what J58 covers, delegates detailed review to their team.

MINUTE 10-15: Optionally, hits "Accept All SAP Standard" for a 
baseline, flags 2-3 known gaps, and hands off to the team.
```

---

## REM-32: Functional Area Business Process Landscape (Layer 1)

### What It Is
A new default view on the scope selection page showing business process chains per functional area. Replaces the flat list as the entry point.

### Previous spec
The complete `process-chains.ts` data structure and `ProcessLandscapeMap.tsx` component were fully specified in the previous Round 3 document. **Those specifications remain valid and should be implemented as written.** The key files are:

**`src/constants/process-chains.ts`** — Contains:
- `FunctionalAreaLandscape` type with `area`, `businessDescription`, `chains[]`
- `ProcessChain` type with `key`, `name`, `abbreviation`, `description`, `type` (core/supporting/specialized), `steps[]`
- `ChainStep` type with `scopeItemId`, `businessName`, `roleInChain`, `position` (start/middle/end/branch), `followsStepIndex`
- `PROCESS_LANDSCAPES` array covering Finance (5 chains), Procurement (4 chains), Sales (2 chains), Warehouse (2 chains), Production (1 chain), Maintenance (1 chain), Services (1 chain)
- Helper functions: `getLandscape()`, `getChainScopeItemIds()`, `getAreaScopeItemIds()`

**`src/components/scope/ProcessLandscapeMap.tsx`** — Contains:
- `ChainStepCard` — individual scope item card with selection toggle, business name, role description, scope item ID badge, and optional FIT/GAP status bar
- `ProcessChainRow` — horizontal row of cards connected by arrows, with "Select entire chain" / "Clear chain" buttons
- `ProcessLandscapeMap` — full landscape for one functional area with all chains, area summary, and "Select all" button

**Integration into scope selection page** — Add view toggle:
```tsx
const [viewMode, setViewMode] = useState<"landscape" | "list">("landscape");
```
Default to "landscape" for new users. "List View" button switches to existing flat list.

### Verification
1. Open scope selection → confirm "Process Map View" is default
2. Confirm Finance shows R2R, P2P, O2C, Treasury, Assets chains
3. Click "Select entire chain" on R2R → confirm J58, J63, J58A, 2NV selected
4. Switch to "List View" → confirm same items checked
5. Switch back → confirm selections preserved

---

## REM-33: Scope Item Process Briefing (Layer 2)

### What It Is
A new page/modal that appears when a user clicks a scope item card (in the landscape view OR the list view). Instead of jumping directly into the step review, it shows a **readable business process briefing** for that scope item — what it covers, how the process flows, what questions to consider, and how the review is structured.

This is the page the department head reads to understand "what does J58 actually do?" before delegating the detailed review.

### Why This Is Different From What Exists
- `ScopeItemSummary` (REM-19) shows stats. This shows a process narrative.
- `ScopeFlowOverview` (REM-15) shows activity cards for navigation. This shows a human-readable process description.
- `purposeHtml`/`overviewHtml` on ScopeItem contains SAP documentation. This extracts and translates it into business language.

### Data Sources

The briefing is composed from THREE sources:

1. **Static curated content** (`scope-briefings.ts`) — Hand-written business process narratives for the most common scope items. These are the gold standard.

2. **Dynamic content from database** — For scope items without curated content, generate the briefing from:
   - `ScopeItem.purposeHtml` → cleaned via `extractScopeSummary()` (already exists in `src/lib/assessment/scope-summary.ts`)
   - `SolutionProcess → ProcessFlow → Activity` hierarchy → rendered as a process flow diagram with step counts
   - `SCOPE_BUSINESS_SUMMARIES` → the 2-3 sentence description as a fallback intro

3. **Contextual guidance** — Pre-written questions the user should consider before reviewing. These are curated per scope item or generated from step categories.

### Files to Create

**File: `src/constants/scope-briefings.ts`**

```typescript
/**
 * Curated business process briefings for scope items.
 * These are the "what does this scope item actually do?" narratives
 * that a department head reads to understand the scope before delegating.
 *
 * Structure per scope item:
 *   sections: Array of { heading, content } blocks organized by
 *             business rhythm (daily/monthly/periodic) or process phases
 *   preReviewQuestions: Questions the user should discuss with their
 *                      team before starting the detailed review
 */

export interface ScopeBriefing {
  sections: Array<{
    heading: string;
    content: string;
  }>;
  preReviewQuestions: string[];
}

export const SCOPE_BRIEFINGS: Record<string, ScopeBriefing> = {
  J58: {
    sections: [
      {
        heading: "Daily Operations",
        content: "Your finance team posts journal entries throughout the month — recording invoices received, payments made, payroll, and any manual adjustments. SAP automates recurring entries (like monthly rent or insurance) so they post automatically. Accruals and deferrals are handled to ensure expenses are recognized in the right period.",
      },
      {
        heading: "Monthly Close",
        content: "At month-end, SAP provides a Closing Cockpit — a checklist that walks your team through every closing task in order. This includes reconciling subledgers (AP, AR, bank) to the general ledger, revaluing any balances held in foreign currencies at the current exchange rate, running asset depreciation, and posting any final adjustment entries. The result is a verified trial balance.",
      },
      {
        heading: "Period-End Reporting",
        content: "Once the books are closed, SAP generates your financial statements — balance sheet, income statement (profit & loss), and cash flow statement. If your company reports by business segment or profit center, SAP can produce segment-level reports. These can be exported to PDF or Excel for management review and regulatory filing.",
      },
      {
        heading: "What's NOT Included Here",
        content: "Accounts Payable (processing vendor invoices) is covered under scope item J60. Accounts Receivable (customer invoices and collections) is under J59. Bank statement import is under 1EG. This scope item focuses specifically on the general ledger, closing, and financial reporting.",
      },
    ],
    preReviewQuestions: [
      "Do you close your books monthly, quarterly, or only annually?",
      "How many legal entities do you operate? Do they transact with each other (intercompany)?",
      "What financial reports does your management team require, and how often?",
      "Do you hold balances in currencies other than MYR? If so, which currencies?",
      "Do you currently have an automated closing checklist, or is it manual?",
      "How long does your current month-end close take (in business days)?",
    ],
  },

  J60: {
    sections: [
      {
        heading: "Invoice Receipt & Capture",
        content: "When your company receives a supplier invoice (by email, paper, or EDI), it needs to be recorded in the system. SAP supports three-way matching — the invoice is automatically compared against the purchase order (what you ordered) and the goods receipt (what actually arrived). Discrepancies are flagged for review.",
      },
      {
        heading: "Invoice Approval & Processing",
        content: "Invoices that pass matching are queued for approval. SAP can route invoices through approval workflows based on amount thresholds, cost center, or supplier. Your AP team reviews exceptions (price differences, quantity mismatches) and either accepts, adjusts, or rejects.",
      },
      {
        heading: "Payment Execution",
        content: "On your payment schedule (typically weekly or bi-weekly), SAP runs a payment proposal — it selects all approved invoices due for payment, applies any early-payment discounts, and groups payments by bank account and payment method. Your team reviews the proposal, then executes the payment run to generate bank transfers, checks, or other payment instruments.",
      },
      {
        heading: "Vendor Account Management",
        content: "SAP maintains a running balance per vendor showing all invoices, credit memos, and payments. Your team can view the vendor's aging report (how much is 0-30 days, 31-60 days, etc.) and reconcile the vendor subledger to the general ledger at month-end.",
      },
    ],
    preReviewQuestions: [
      "How do supplier invoices arrive today — email, paper, supplier portal, EDI?",
      "Do you do three-way matching (invoice vs. PO vs. goods receipt) or simpler matching?",
      "What is your approval workflow — who approves invoices, at what thresholds?",
      "How often do you run payment batches — weekly, bi-weekly, monthly?",
      "What payment methods do you use — bank transfer, check, other?",
      "Do you take early-payment discounts? How are these tracked today?",
    ],
  },

  J59: {
    sections: [
      {
        heading: "Customer Invoicing",
        content: "After goods are shipped or services delivered, SAP automatically generates a customer invoice based on the sales order and delivery documents. Invoices can be sent by email, printed, or transmitted electronically via EDI or e-invoicing platforms. Pricing, taxes (including Malaysian SST), and payment terms are applied automatically from master data.",
      },
      {
        heading: "Payment Collection & Matching",
        content: "When customer payments arrive (via bank transfer, check, or collection), SAP matches the payment to the open invoice. If a customer pays multiple invoices in one transfer, SAP can split the payment across the open items. Partial payments and overpayments are handled with residual or on-account posting.",
      },
      {
        heading: "Dunning (Payment Reminders)",
        content: "For overdue invoices, SAP runs a dunning program that sends escalating payment reminders to customers. You configure dunning levels (e.g., friendly reminder at 15 days, formal notice at 30 days, final warning at 60 days). Each level can have a different letter template and escalation action.",
      },
      {
        heading: "Customer Account Management",
        content: "SAP maintains a customer aging report showing outstanding balances by age bucket. Your AR team uses this to prioritize collections. At month-end, the customer subledger is reconciled to the general ledger to ensure all revenue and receivables are correctly stated.",
      },
    ],
    preReviewQuestions: [
      "How do you generate and send invoices today — manually, from an ERP, from a billing system?",
      "Do you use e-invoicing or EDI with any customers?",
      "How do customer payments arrive — bank transfer, check, collection, other?",
      "Do you currently send payment reminders for overdue invoices? How?",
      "What are your standard payment terms (e.g., Net 30, Net 60)?",
      "How do you handle partial payments or customer disputes?",
    ],
  },

  "1EG": {
    sections: [
      {
        heading: "Bank Statement Import",
        content: "Your bank sends electronic statements in standard formats — MT940 (end-of-day), MT942 (intraday), or the newer ISO 20022 formats (camt.053 for end-of-day, camt.052 for intraday). SAP imports these files automatically and parses each line item (deposits, withdrawals, fees, interest) into individual bank transactions.",
      },
      {
        heading: "Automatic Matching",
        content: "SAP attempts to match each bank transaction to an open item in your books — for example, matching an incoming payment to an open customer invoice, or matching an outgoing transfer to a vendor payment you initiated. The matching uses rules you configure (invoice reference number, amount, date range).",
      },
      {
        heading: "Manual Reconciliation",
        content: "Transactions that can't be auto-matched are queued for manual review. Your team sees the bank line item alongside suggested matches from your open items. They can accept a suggestion, manually find the match, or post the transaction directly (e.g., bank fees that don't match any existing document).",
      },
      {
        heading: "Outgoing Payments",
        content: "When SAP generates payment files (from the AP payment run), these are exported in the format your bank requires (e.g., pain.001 for SEPA, pain.002 for status reports). SAP tracks the payment status — submitted, accepted by bank, rejected — so your team knows if a payment failed.",
      },
    ],
    preReviewQuestions: [
      "Does your bank currently provide electronic statements? In what format (MT940, CSV, other)?",
      "How do you reconcile bank statements today — manual spreadsheet, semi-automated, fully automated?",
      "How many bank accounts does your company operate?",
      "How many transactions per day/week/month flow through your main bank account?",
      "Do you need intraday bank statement visibility, or is end-of-day sufficient?",
    ],
  },

  J14: {
    sections: [
      {
        heading: "Purchase Requisition & Approval",
        content: "When someone in your organization needs to buy goods or services, they create a purchase requisition in SAP. This specifies what they need, how much, when, and from which budget. The requisition goes through an approval workflow — typically based on amount, cost center, or material type. Managers approve or reject with one click.",
      },
      {
        heading: "Purchase Order Creation",
        content: "Approved requisitions are converted into purchase orders (POs). SAP can auto-create POs from approved requisitions if you have predefined suppliers and pricing agreements. The PO is sent to the supplier electronically (email, EDI, or supplier portal) and becomes the contractual commitment to buy.",
      },
      {
        heading: "Goods Receipt",
        content: "When the ordered goods arrive at your location, your receiving team records a Goods Receipt in SAP. This updates your inventory quantities and triggers the three-way match (PO → GR → Invoice). If the delivered quantity differs from the ordered quantity, SAP flags the discrepancy.",
      },
      {
        heading: "Invoice Verification & Closing",
        content: "The supplier's invoice is matched against the PO and goods receipt. SAP handles price variances, quantity variances, and tax calculations. Once verified, the invoice is posted to Accounts Payable. The purchase order is then closed — either fully matched or with a residual that can be written off.",
      },
    ],
    preReviewQuestions: [
      "How do purchase requests currently get initiated and approved in your company?",
      "Do you have preferred/contracted suppliers, or do you source ad-hoc for each purchase?",
      "How do you track goods receipt today — warehouse system, manual logs, ERP?",
      "Do you do three-way matching (PO vs. GR vs. invoice)? Is it automated or manual?",
      "What approval limits exist for different roles (e.g., team lead up to 5K, director up to 50K)?",
    ],
  },

  BNX: {
    sections: [
      {
        heading: "Self-Service Purchasing",
        content: "For everyday items like office supplies, cleaning products, or printer cartridges, SAP provides a simplified purchasing experience. Staff can browse a pre-approved catalog, select items, and submit a purchase request without going through the full procurement process.",
      },
      {
        heading: "Automated Processing",
        content: "For catalog items with pre-negotiated prices and approved suppliers, SAP can auto-create purchase orders and send them directly to the supplier. This eliminates the manual PO creation step and speeds up delivery for routine purchases.",
      },
    ],
    preReviewQuestions: [
      "How do your staff currently order office supplies and consumables?",
      "Do you have contracted suppliers for common consumable items?",
      "Is there a spending limit for self-service purchases (e.g., under RM500 no approval needed)?",
    ],
  },

  BKP: {
    sections: [
      {
        heading: "Sales Order Entry",
        content: "When a customer places an order, your sales team creates a Sales Order in SAP. The system automatically checks product availability in your warehouse, confirms the delivery date, and calculates the price based on your pricing agreements, discounts, and conditions. The customer receives an order confirmation.",
      },
      {
        heading: "Delivery & Shipping",
        content: "Once the sales order is confirmed, SAP creates an outbound delivery document. Your warehouse team picks the goods, packs them, and records the shipment. SAP can integrate with logistics providers for shipping labels, tracking numbers, and proof of delivery.",
      },
      {
        heading: "Billing & Revenue",
        content: "After goods are shipped (or services delivered), SAP generates the customer invoice automatically. The invoice posts to Accounts Receivable and recognizes the revenue. If you have complex pricing (tiered, volume-based, promotional), SAP calculates it all from your pricing master data.",
      },
    ],
    preReviewQuestions: [
      "How do customer orders come in — phone, email, web portal, EDI?",
      "How is product availability checked today — real-time system, manual stock check?",
      "Do you use a logistics provider for deliveries, or handle shipping in-house?",
      "How complex is your pricing — standard price list, customer-specific discounts, volume tiers?",
    ],
  },

  // Add more scope items as needed. For scope items without a curated
  // briefing, the system falls back to dynamic generation from purposeHtml
  // + hierarchy data.
};

export function getScopeBriefing(scopeItemId: string): ScopeBriefing | null {
  return SCOPE_BRIEFINGS[scopeItemId] ?? null;
}
```

**File: `src/components/scope/ScopeItemBriefing.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, ArrowRight, Clock, HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getScopeBriefing } from "@/constants/scope-briefings";
import { SCOPE_BUSINESS_SUMMARIES } from "@/constants/scope-summaries";
import { extractScopeSummary } from "@/lib/assessment/scope-summary";

interface ProcessArea {
  name: string;
  stepCount: number;
  classifiableCount: number;
}

interface ScopeItemBriefingProps {
  scopeItemId: string;
  scopeItemName: string;
  /** From ScopeItem.purposeHtml — fallback content if no curated briefing */
  purposeHtml: string | null;
  /** Derived from SolutionProcess → ProcessFlow hierarchy */
  processAreas: ProcessArea[];
  /** Total classifiable steps across all areas */
  totalClassifiable: number;
  totalSteps: number;
  /** Whether the item is currently selected for assessment */
  isSelected: boolean;
  /** Callbacks */
  onStartReview: () => void;
  onBack: () => void;
  onToggleSelection: () => void;
}

export function ScopeItemBriefing({
  scopeItemId,
  scopeItemName,
  purposeHtml,
  processAreas,
  totalClassifiable,
  totalSteps,
  isSelected,
  onStartReview,
  onBack,
  onToggleSelection,
}: ScopeItemBriefingProps) {
  const briefing = getScopeBriefing(scopeItemId);
  const fallbackSummary = SCOPE_BUSINESS_SUMMARIES[scopeItemId]
    ?? extractScopeSummary(purposeHtml, 300);

  const estimatedMinutes = Math.ceil(totalClassifiable * 1);
  const hours = Math.floor(estimatedMinutes / 60);
  const mins = estimatedMinutes % 60;
  const timeLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

  const [questionsExpanded, setQuestionsExpanded] = useState(false);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Scope Selection
      </button>

      {/* Header */}
      <div className="bg-card rounded-lg border p-6 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <Badge variant="outline" className="text-[10px] mb-2">{scopeItemId}</Badge>
            <h1 className="text-xl font-bold text-foreground">{scopeItemName}</h1>
          </div>
          <Button
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={onToggleSelection}
          >
            {isSelected ? "☑ Selected" : "☐ Select"}
          </Button>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{totalSteps}</strong> total steps</span>
          <span><strong className="text-foreground">{totalClassifiable}</strong> need your input</span>
          <span><strong className="text-foreground">{processAreas.length}</strong> process areas</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            ~{timeLabel} to review
          </span>
        </div>
      </div>

      {/* WHAT THIS COVERS — curated or fallback */}
      <div className="bg-card rounded-lg border p-6 mb-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
          What This Covers
        </h2>

        {briefing ? (
          /* Curated briefing — structured sections */
          <div className="space-y-4">
            {briefing.sections.map((section, i) => (
              <div key={i}>
                <h3 className="text-sm font-medium text-foreground">{section.heading}</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
        ) : (
          /* Fallback — extracted summary from purposeHtml */
          <p className="text-sm text-muted-foreground leading-relaxed">
            {fallbackSummary || `This scope item covers ${scopeItemName.toLowerCase()} processes in SAP. Click "Start Detailed Review" to see the full process steps.`}
          </p>
        )}
      </div>

      {/* PROCESS AREAS — derived from hierarchy */}
      {processAreas.length > 0 && (
        <div className="bg-card rounded-lg border p-6 mb-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
            How the Review Is Structured
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            The detailed review is organized into these process areas. Each area contains a set of steps that your team will classify.
          </p>
          <div className="flex flex-wrap gap-2">
            {processAreas.map((area, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30 min-w-[180px]"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {i + 1}
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground leading-snug">{area.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {area.classifiableCount} steps to review
                  </p>
                </div>
              </div>
            ))}
          </div>
          {processAreas.length > 1 && (
            <p className="text-[10px] text-muted-foreground/60 mt-3 italic">
              You can complete these in any order. Progress is saved automatically.
            </p>
          )}
        </div>
      )}

      {/* PRE-REVIEW QUESTIONS — curated only */}
      {briefing?.preReviewQuestions && briefing.preReviewQuestions.length > 0 && (
        <div className="bg-card rounded-lg border p-6 mb-4">
          <button
            onClick={() => setQuestionsExpanded(!questionsExpanded)}
            className="flex items-center gap-2 w-full text-left"
          >
            {questionsExpanded
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />
            }
            <HelpCircle className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-foreground">
              Questions to Discuss With Your Team Before Reviewing
            </h2>
          </button>
          {questionsExpanded && (
            <div className="mt-3 space-y-2 pl-10">
              {briefing.preReviewQuestions.map((q, i) => (
                <p key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-blue-400 shrink-0">{i + 1}.</span>
                  {q}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between py-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back to Scope
        </Button>
        {isSelected && (
          <Button onClick={onStartReview}>
            Start Detailed Review
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
```

### Integration Points

**From ProcessLandscapeMap**: When user clicks a `ChainStepCard`, instead of toggling selection, OPEN the `ScopeItemBriefing` for that scope item. Add a small ⓘ icon on each card that triggers the briefing.

**From ScopeSelectionClient (list view)**: Add a "View Details" button or info icon on each scope item row. Clicking opens the briefing.

**Data loading**: The briefing needs `processAreas` derived from the `SolutionProcess → ProcessFlow` hierarchy. Fetch this from `/api/catalog/scope-items/[scopeItemId]/hierarchy` (already exists), then flatten:

```typescript
const processAreas: ProcessArea[] = tree.processes.map(p => ({
  name: p.name === "__main_process__" ? scopeItemName : p.name,
  stepCount: p.flows.reduce((sum, f) =>
    sum + f.activities.reduce((s, a) => s + a.stepCount, 0), 0),
  classifiableCount: p.flows.reduce((sum, f) =>
    sum + f.activities.reduce((s, a) => s + (a.classifiableCount ?? a.stepCount), 0), 0),
}));
```

### Verification
1. From landscape view, click ⓘ on "Journal Entries & Posting" (J58 card)
2. Confirm briefing page opens with heading "Accounting & Financial Close"
3. Confirm "What This Covers" shows 4 sections: Daily Operations, Monthly Close, Period-End Reporting, What's NOT Included
4. Confirm "How the Review Is Structured" shows numbered process areas with step counts
5. Expand "Questions to Discuss" → confirm 6 questions appear
6. Click "Start Detailed Review" → navigate to review page for J58
7. Click Back → return to landscape view
8. Click ⓘ on BFB (no curated briefing) → confirm fallback summary shows extracted text from purposeHtml

---

## Implementation Priority

| Order | Item | Time | Impact |
|---|---|---|---|
| **1st** | REM-32: `process-chains.ts` + `ProcessLandscapeMap.tsx` + scope page integration | 6-8h | Transforms scope selection from "550 codes" to "business process chains" |
| **2nd** | REM-33: `scope-briefings.ts` (J58, J60, J59, 1EG, J14, BNX, BKP) + `ScopeItemBriefing.tsx` | 4-6h | Department head can read and understand each scope item in 3 minutes |
| **3rd** | Expand briefings to remaining scope items | Ongoing | Add briefings as assessments demand them. Fallback to purposeHtml always works. |

---

## The Test: Can the Head of Finance Finish in 15 Minutes?

After REM-32 + REM-33:

1. **Minute 0-1**: Open scope selection. See Finance landscape. Read "R2R = closing cycle, P2P = buying, O2C = selling, Treasury = banking."
2. **Minute 1-3**: Click "Select entire chain" for R2R and P2P. Click ⓘ on J58 to see what's involved.
3. **Minute 3-6**: Read J58 briefing. "OK, we close monthly, we don't have intercompany, we do hold USD balances." Note the 5 process areas and ~350 classifiable steps.
4. **Minute 6-8**: Click ⓘ on J60. "OK, AP is straightforward, we do three-way matching, weekly payment runs."
5. **Minute 8-10**: Skip Treasury (we use a separate treasury system). Skip Assets (immaterial).
6. **Minute 10-12**: Review summary. "8 scope items selected. R2R fully covered. P2P fully covered." 
7. **Minute 12-15**: Click "Start Detailed Review" on J58. Hit "Accept All SAP Standard" for a baseline. Flag 2 known gaps. Hand off to team for detailed classification.

**Total**: 15 minutes. The assessment is meaningfully scoped and the detailed review is framed correctly.

Without REM-32 + REM-33: The same person spends 3 hours clicking through 550 items, Googling SAP terms, and closes the tab.
