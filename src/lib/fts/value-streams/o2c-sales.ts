/**
 * Order-to-Cash (Sales) — value-stream affirm-set.
 *
 * The 28 Level-2 questions SAP's own BDC questionnaire (S4H_433) carries
 * for the Order-to-Cash value stream. Generated from
 * curation-model/O2C-Sales-Question-Set.xlsx — Columns A–F are verbatim
 * from the SAP source; Column G ("client-facing rephrase") is the
 * consultant curation step and is intentionally null until curated.
 *
 * STRUCTURE
 *   - The whole stream is exposed as ONE catalog entry with
 *     code = "O2C-SALES" and value_stream = true.
 *   - 4 narrative questions (Business Overview) → answer_kind = 'narrative'
 *   - 24 decision questions → answer_kind = 'decision' (default).
 *   - Every decision card opens pre-set to "Adopt SAP standard" — the
 *     workbench page initializes choice = 'std' for any decision without
 *     a stored row.
 *
 * PROVENANCE
 *   Every row carries sscui_id (real SAP SSCUI, re-validated against the 2608 list),
 *   area_topic, scope_item_refs, sap_verbatim. Re-generate from a fresh
 *   pull when SAP ships the next release; do NOT hand-edit content.
 *
 * NOT INVENTED
 *   Do not author or paraphrase the SAP question text in this file —
 *   it must trace back to the spreadsheet. The plain-language version
 *   that the client sees comes from client_rephrase, which is set by
 *   the consultant curation pass (gate B of the kickoff).
 */

import type { ScopeItemContent, Decision } from '../types';

const SOURCE_RELEASE = 'S/4HANA Cloud Public Edition 2608';
const SOURCE_NOTE =
  'Generated from SAP BDC Questionnaire S4H_433 (byte-identical 2602→2608) · SSCUI ids re-validated against SSCUI_List 2608 (WS1) · the Level-2 pre-workshop affirm-set.';

/** Narrative-style question — Business Overview. No SSCUI, free-text answer. */
function n(
  id: string,
  title: string,
  sapVerbatim: string,
  clientRephrase: string | null = null,
): Decision {
  return {
    id,
    title,
    summary: clientRephrase ?? sapVerbatim,
    sscui: 'N/A (narrative)',
    sscui_id: '',
    sscui_name: '',
    std_desc: '',
    cfg_desc: '',
    cst_desc: '',
    effort: 0,
    custom_type: '',
    ext_impact: '',
    ricefw_class: '',
    level: 'L2',
    area_topic: 'Business Overview',
    answer_kind: 'narrative',
    sap_verbatim: sapVerbatim,
    client_rephrase: clientRephrase,
  };
}

/** Decision-style question — adopt/discuss/deviate, defaults to standard. */
function d(args: {
  id: string;
  /** Short display label (the SSCUI name). */
  title: string;
  areaTopic: string;
  sscuiId: string;
  sscuiName: string;
  scopeItemRefs: string[];
  sapVerbatim: string;
  clientRephrase?: string | null;
}): Decision {
  const sscuiCombined = `${args.sscuiId} — ${args.sscuiName}`;
  return {
    id: args.id,
    title: args.title,
    summary: args.clientRephrase ?? args.sapVerbatim,
    sscui: sscuiCombined,
    sscui_id: args.sscuiId,
    sscui_name: args.sscuiName,
    // The legacy *_desc fields are unused in the enhanced view (no
    // Standard/Configure/Custom matrix); we map to the three-mode
    // chip behavior at the UI layer. Provide neutral defaults so the
    // existing Excel-export path doesn't crash.
    std_desc: 'Adopt the SAP standard as delivered for this SSCUI.',
    cfg_desc: 'Configure within standard SSCUI options at the Fit-to-Standard workshop.',
    cst_desc: 'Custom — requires extensibility or development beyond standard.',
    effort: 0,
    custom_type: '',
    ext_impact: '',
    ricefw_class: '',
    level: 'L2',
    area_topic: args.areaTopic,
    scope_item_refs: args.scopeItemRefs,
    answer_kind: 'decision',
    sap_verbatim: args.sapVerbatim,
    client_rephrase: args.clientRephrase ?? null,
  };
}

const decisions: Decision[] = [
  // ───── Business Overview (4 narrative questions) ─────────────────
  n(
    'q1',
    'Sales operations overview',
    "Please provide a general description of your business' sales operations. Particularly please provide information on the type of products or services that are sold.",
  ),
  n(
    'q2',
    'Sales scenarios in scope',
    'What significantly different sales scenarios exist for your business? A sales scenario may include all situations where a customer-facing billing document is generated. For example, the sale of services to domestic customers, versus the sale of inventory managed items to domestic customers would constitute two distinct sales scenarios. Please number and describe each distinct sales scenarios that could be in scope for the project.',
  ),
  n(
    'q3',
    'Inventory-managed materials',
    'Will the materials you sell through the system, and described in your sales scenarios - need to be inventory managed within the SAP system? If yes, please indicate for which sales scenarios inventory management will be required.',
  ),
  n(
    'q4',
    'Customer types',
    'How many different types of customers do you bill? For example, other businesses that are domestic customers, intercompany entities, foreign customers, government entities could each constitute different customer types.',
  ),

  // ───── Organization (5 decisions) ────────────────────────────────
  d({
    id: 'q5',
    title: 'Sales Organizations',
    areaTopic: 'Organization',
    sscuiId: '105970',
    sscuiName: 'Maintain Sales Organizations',
    scopeItemRefs: ['BD9', '2EQ', 'I9I', 'BKA', 'BDD', '1EZ', '1F1', '1MC', '1J7', 'J14'],
    sapVerbatim:
      'Provide information about all the Sales Entities that are in scope for the project. The details include Name, Address, Country, Language, Jurisdiction Code etc.',
  }),
  d({
    id: 'q6',
    title: 'Distribution Channels',
    areaTopic: 'Organization',
    sscuiId: '106006',
    sscuiName: 'Maintain Distribution Channels',
    scopeItemRefs: ['BD9', '2EQ', 'I9I', 'BKA', 'BDD', '1EZ', '1F1', '1MC', '1J7', 'J14'],
    sapVerbatim:
      'Please provide a description for each distribution channel you have defined (e.g. Wholesale, Retail, Digital).',
  }),
  d({
    id: 'q7',
    title: 'Define Division',
    areaTopic: 'Organization',
    sscuiId: '106005',
    sscuiName: 'Maintain Divisions',
    scopeItemRefs: ['BD9', '2EQ', 'I9I', 'BKA', 'BDD', '1EZ', '1F1', '1MC', '1J7', 'J14'],
    sapVerbatim:
      'How many product divisions do you currently have? Please provide a description for each of these.',
  }),
  d({
    id: 'q8',
    title: 'Sales Offices',
    areaTopic: 'Organization',
    sscuiId: '105866',
    sscuiName: 'Maintain Sales Office',
    scopeItemRefs: ['BD9', '2EQ', 'I9I', 'BKA', 'BDD', '1EZ', '1F1', '1MC', '1J7', 'J14'],
    sapVerbatim:
      'Please provide information about each Sales Office such as Name, Address, Country, Language, Jurisdiction Code etc.',
  }),
  d({
    id: 'q9',
    title: 'Sales Groups',
    areaTopic: 'Organization',
    sscuiId: '105998',
    sscuiName: 'Maintain Sales Group',
    scopeItemRefs: ['BD9', '2EQ', 'I9I', 'BKA', 'BDD', '1EZ', '1F1', '1MC', '1J7', 'J14'],
    sapVerbatim:
      'Please describe the different sales groupings that you assign to your customers in order to identify their responsible sales representatives.',
  }),

  // ───── Sales Order Management and Processing (3 decisions) ───────
  d({
    id: 'q10',
    title: 'Configure Item Categories',
    areaTopic: 'Sales Order Management and Processing — Sales Documents',
    sscuiId: '103411',
    sscuiName: 'Configure Item Categories',
    scopeItemRefs: ['BD9', 'BKA', '2EQ', 'BDD', '1EZ', '1F1', 'J14'],
    sapVerbatim:
      'Should all sales order line items be processed for the quantity ordered, or should rounding of the ordered quantity be permitted? If rounding should be allowed, please describe in which scenarios or item categories this should be enabled.',
  }),
  d({
    id: 'q11',
    title: 'Define Purchase Order Types',
    areaTopic: 'Sales Order Management and Processing — Sales Documents',
    sscuiId: '103394',
    sscuiName: 'Define Purchase Order Types',
    scopeItemRefs: ['BD9', 'BKA', '2EQ', 'BDD', '1EZ', '1F1', 'J14'],
    sapVerbatim:
      'Do you need to track different means of purchase requests used by your customers? If so, please describe the types that you would like to track in your sales documents. You can specify whether an order was received online, by phone, or by fax etc.',
  }),
  d({
    id: 'q12',
    title: 'Assign Custom Routines to Sales Document Types',
    areaTopic: 'Sales Order Management and Processing — Sales Documents',
    sscuiId: '103823',
    sscuiName: 'Assign Custom Routines to Sales Document Types',
    scopeItemRefs: ['BD9', 'BDG'],
    sapVerbatim:
      'Please mention if you require flexible proposal of requested delivery date to be applied and further choose the sales document types (Quotation / Sales Order) that are relevant.',
  }),

  // ───── Basic Functions (4 decisions) ─────────────────────────────
  d({
    id: 'q13',
    title: 'Maintain Algorithm Parameters for Intelligent Product Proposal',
    areaTopic: 'Basic Functions — Intelligent Product Proposal',
    // 2608: 103833 (Algorithm Parameters) is no longer in the SSCUI list; the
    // Intelligent Product Proposal is configured through procedure determination
    // (103834 background / 103835 online). Nearest real 2608 activity, not identical.
    sscuiId: '103834',
    sscuiName: 'Maintain Backgr. Procedure Determination for Intelligent Product Proposal',
    scopeItemRefs: ['BD9'],
    sapVerbatim:
      'Decide and mention if you wish to enable the intelligent product proposal. Additionally, identify the customers (Business Partners) for whom you want to enable the intelligent product proposal.',
  }),
  d({
    id: 'q14',
    title: 'Define Reasons for Approval Requests',
    areaTopic: 'Basic Functions — Sales Document Approvals',
    sscuiId: '102751',
    sscuiName: 'Define Reasons for Approval Requests',
    scopeItemRefs: ['BDG', '1EZ', 'BKL'],
    sapVerbatim:
      'Will you utilize workflows on sales quotations? If so, please list the reasons to be displayed to business users as to why the document requires release.',
  }),
  d({
    id: 'q16',
    title: 'Define Incompleteness Procedures',
    areaTopic: 'Basic Functions — Incompleteness Procedures',
    sscuiId: '101189',
    sscuiName: 'Define Incompleteness Procedures',
    scopeItemRefs: ['BD9', '2EQ', 'BKA', 'BDD', '1EZ', '1F1', '1MC'],
    sapVerbatim:
      'Please review the preconfigured incompleteness procedures in the starter system. Do you have any additional requirements for data that must exist on sales orders or delivery documents in order for them to proceed to the next stage of the sales process?',
  }),
  d({
    id: 'q17',
    title: 'Activate Listing/Exclusion by Sales Document Type',
    areaTopic: 'Basic Functions — Listing/Inclusion',
    sscuiId: '103031',
    sscuiName: 'Activate Listing/Exclusion by Sales Document Type',
    scopeItemRefs: ['BD9', '2EQ', 'BKA', 'BDD', '1EZ', '1F1', '1MC'],
    sapVerbatim:
      'Do you restrict which materials can be sold, credited, debited, returned etc. on the basis of material, customer, plant or unit of measure? If so, please describe the listings or exclusions that need to be considered in your various sales scenarios.',
  }),

  // ───── Claims, Returns, and Refund Management (1 decision) ───────
  d({
    id: 'q15',
    title: 'Define Return Reasons for Customer Returns',
    areaTopic: 'Claims, Returns, and Refund Management — Customer Returns',
    sscuiId: '102382',
    sscuiName: 'Define Return Reasons for Customer Returns',
    scopeItemRefs: ['BDW', 'BDD', 'BKP', '1Z3'],
    sapVerbatim:
      'Please review the standard return order reasons in the starter system. If you require modifications to the existing descriptions, or if you need additional reasons, please describe the additional reasons.',
  }),

  // ───── Available to Promise (1 decision) ─────────────────────────
  d({
    id: 'q18',
    title: 'Configure Scope of Availability Check',
    areaTopic: 'Available to Promise — ATP: Product Availability Check',
    sscuiId: '101099',
    sscuiName: 'Configure Scope of Availability Check',
    scopeItemRefs: ['2LN', 'BD9', 'BKA', 'BDD'],
    sapVerbatim:
      'Do you consider different factors such as stock committed to other orders, stock in restricted status, safety stock, and stock due to be received at a later date when determining stock available to offer to customers? If so, please describe these scenarios',
  }),

  // ───── Shipping (1 decision) ─────────────────────────────────────
  d({
    id: 'q19',
    title: 'Define Delivery Priorities',
    areaTopic: 'Shipping — Deliveries',
    sscuiId: '102124',
    sscuiName: 'Define Delivery Priorities',
    scopeItemRefs: ['2LN', 'BD9', 'BKA', 'BDD'],
    sapVerbatim:
      'Do you give priority for orders/deliveries to certain customers or groups of customers on a regular basis? The SAP Starter System comes with three delivery priorities, 1 - High, 2 - Medium and 3 - Low that can be assigned in customer master. Please advise if you want to edit these descriptions or create more Delivery Priority categories.',
  }),

  // ───── Price Management (2 decisions) ────────────────────────────
  d({
    id: 'q20',
    title: 'Set Pricing Procedures',
    areaTopic: 'Price Management — Pricing',
    sscuiId: '101117',
    sscuiName: 'Set Pricing Procedures',
    scopeItemRefs: ['BD9', '2EQ', 'BKA', 'BDD', '1EZ', '1F1', '1MC'],
    sapVerbatim:
      'Do you require a different pricing logic to be used in different circumstances? If so, please describe the different pricing flows you anticipate and their pricing elements.',
  }),
  d({
    id: 'q21',
    title: 'Set Pricing Procedure Determination',
    areaTopic: 'Price Management — Pricing',
    sscuiId: '101118',
    sscuiName: 'Set Pricing Procedure Determination',
    scopeItemRefs: ['BD9', '2EQ', 'BKA', 'BDD', '1EZ', '1F1', '1MC'],
    sapVerbatim:
      'If you have multiple pricing procedures, please describe in which circumstances each one should be used.',
  }),

  // ───── Batch Management (1 decision) ─────────────────────────────
  d({
    id: 'q22',
    title: 'Activate Automatic Batch Determination for Delivery Item Categories',
    areaTopic: 'Batch Management — Batch Determination for Sales and Distribution',
    sscuiId: '102172',
    sscuiName: 'Activate Automatic Batch Determination for Delivery Item Categories',
    scopeItemRefs: ['BLF', 'BJE', 'BD9', 'BKA', 'BDD', 'BKP', '1Z3', 'BDW'],
    sapVerbatim:
      'Do you only want automatic batch determination to be carried out on the delivery? If so, please describe the types of deliveries in which automatic batch determination should occur.',
  }),

  // ───── Billing Plans (1 decision) ────────────────────────────────
  d({
    id: 'q23',
    title: 'Maintain the Milestone Billing Plan Type',
    areaTopic: 'Billing Plans — Sales Billing',
    sscuiId: '102791',
    sscuiName: 'Maintain the Milestone Billing Plan Type',
    scopeItemRefs: ['BKJ', 'BD9', '2EQ'],
    sapVerbatim:
      'Will you use milestone billing? If so, indicate the basis on which the start and end of the milestone billing plan will be based.',
  }),

  // ───── Billing Enhancements (2 decisions) ────────────────────────
  d({
    id: 'q24',
    title: 'Define Number Ranges for Billing Documents',
    areaTopic: 'Billing Enhancements — Sales Billing',
    sscuiId: '103284',
    sscuiName: 'Define Number Ranges for Billing Documents',
    scopeItemRefs: ['BD9', '2EQ', 'BKA', 'BDD', '1EZ', '1F1', '1MC'],
    sapVerbatim:
      'If you require a modification to the pre-delivered number ranges assigned to preliminary billing documents and billing documents, please indicate the number ranges to be assigned to each.',
  }),
  d({
    id: 'q25',
    title: 'Define Number Range Prefixes for Billing Document',
    areaTopic: 'Billing Enhancements — Sales Billing',
    sscuiId: '103283',
    sscuiName: 'Define Number Range Prefixes for Billing Document',
    scopeItemRefs: ['BD9', '2EQ', 'BKA', 'BDD', '1EZ', '1F1', '1MC'],
    sapVerbatim:
      'Do you require custom logic to be applied to determine the billing document numbering the system should apply to your billing documents? If so, please describe the prefixes that should be assigned to the different scenarios.',
  }),

  // ───── Sales Master Data Management (3 decisions) ────────────────
  d({
    id: 'q26',
    title: 'Define Customer Groups',
    areaTopic: 'Sales Master Data Management — Business Partner',
    sscuiId: '103192',
    sscuiName: 'Define Customer Groups',
    scopeItemRefs: ['BD9', '2EQ', 'BKA', 'BDD', '1EZ', '1F1', '1MC'],
    sapVerbatim:
      'Do you define multiple customer groups for pricing or reporting purposes? If so, please describe the various groups.',
  }),
  d({
    id: 'q27',
    title: 'Define Customer Classifications',
    areaTopic: 'Sales Master Data Management — Business Partner',
    sscuiId: '103026',
    sscuiName: 'Define Customer Classifications',
    scopeItemRefs: ['BD9', '2EQ', 'BKA', 'BDD', '1EZ', '1F1', '1MC'],
    sapVerbatim:
      'Do you classify customers into separate groups that are used to determine priority when determining product allocation? If so, please provide a list of your customer categories and describe how you handle the customers differently according to this classification.',
  }),
  d({
    id: 'q28',
    title: 'Define Sales Districts',
    areaTopic: 'Sales Master Data Management — Business Partner',
    sscuiId: '103196',
    sscuiName: 'Define Sales Districts',
    scopeItemRefs: ['BD9', '2EQ', 'I9I', 'BKA', 'BDD', '1EZ', '1F1', '1MC', '1J7', 'J14'],
    sapVerbatim:
      'Please define the different sales districts that you would want to identify separately in your sales reports.',
  }),
];

/** Ordered list of area-topic group headers, in the sequence the
 * mockup uses. Used by the UI to render area bands in stable order. */
export const O2C_SALES_AREA_ORDER: ReadonlyArray<string> = [
  'Business Overview',
  'Organization',
  'Sales Order Management and Processing — Sales Documents',
  'Basic Functions — Intelligent Product Proposal',
  'Basic Functions — Sales Document Approvals',
  'Claims, Returns, and Refund Management — Customer Returns',
  'Basic Functions — Incompleteness Procedures',
  'Basic Functions — Listing/Inclusion',
  'Available to Promise — ATP: Product Availability Check',
  'Shipping — Deliveries',
  'Price Management — Pricing',
  'Batch Management — Batch Determination for Sales and Distribution',
  'Billing Plans — Sales Billing',
  'Billing Enhancements — Sales Billing',
  'Sales Master Data Management — Business Partner',
];

/** Top-level area band — drops the "— sub-topic" suffix and uppercases. */
export function topLevelArea(areaTopic: string): string {
  return (areaTopic.split('—')[0] ?? areaTopic).trim();
}

export const O2C_SALES: ScopeItemContent = {
  code: 'O2C-SALES',
  title: 'Order-to-Cash — Sales',
  overview:
    "The pre-onboarding scoping for the SAP Order-to-Cash value stream: 28 Level-2 questions from SAP's BDC questionnaire S4H_433. Every card opens pre-set to Adopt SAP standard — confirming is one tap.",
  business_roles: [],
  fiori_apps: [],
  process_steps: [],
  master_data: [],
  succeeding_processes: [],
  decisions,
  sscui_refs: [],
  release: SOURCE_RELEASE,
  value_stream: true,
  source_note: SOURCE_NOTE,
};
