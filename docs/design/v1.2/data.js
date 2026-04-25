// Aptus sample data — Bursa Malaysia Berhad engagement (canonical) + supporting fixtures.
// SAP scope items use real S/4HANA Cloud Public Edition codes from the SAP 2602 catalog.

(function () {
  // ─── Scope items: 32 entries from SAP 2602 ───────────────────
  const SCOPE = [
    // Finance
    { id: "J60", name: "Accounts Payable",                       area: "Finance",                   steps: 741, granularity: "Coarse", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 38, lastReviewed: "3 days ago" },
    { id: "J62", name: "Accounts Receivable",                    area: "Finance",                   steps: 612, granularity: "Coarse", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 31, lastReviewed: "3 days ago" },
    { id: "2EJ", name: "Vendor Invoice Management",              area: "Finance",                   steps: 188, granularity: "Medium", verdict: "Mostly Configuration",  classification: "Configuration", reqs: 22, lastReviewed: "2 days ago" },
    { id: "1GA", name: "General Ledger",                         area: "Finance",                   steps: 902, granularity: "Coarse", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 44, lastReviewed: "4 days ago" },
    { id: "1J2", name: "Asset Accounting",                       area: "Finance",                   steps: 414, granularity: "Medium", verdict: "Has Gaps",              classification: "Gap",           reqs: 19, lastReviewed: "Yesterday" },
    { id: "J58", name: "Accounting & Financial Close",           area: "Finance",                   steps: 521, granularity: "Coarse", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 28, lastReviewed: "Yesterday" },
    { id: "1GO", name: "Tax Reporting",                          area: "Finance",                   steps: 287, granularity: "Medium", verdict: "Mostly Configuration",  classification: "Configuration", reqs: 17, lastReviewed: "5 days ago" },
    { id: "J55", name: "Cost Center Accounting",                 area: "Finance",                   steps: 332, granularity: "Coarse", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 21, lastReviewed: "Yesterday" },

    // Treasury
    { id: "BFA", name: "Cash Management",                        area: "Treasury",                  steps: 286, granularity: "Fine",   verdict: "Has Gaps",              classification: "Gap",           reqs: 27, lastReviewed: "Today" },
    { id: "1MC", name: "Bank Account Management",                area: "Treasury",                  steps: 195, granularity: "Medium", verdict: "Mostly Configuration",  classification: "Configuration", reqs: 14, lastReviewed: "Yesterday" },
    { id: "1XF", name: "Liquidity Management",                   area: "Treasury",                  steps: 174, granularity: "Medium", verdict: "Has Gaps",              classification: "Gap",           reqs: 11, lastReviewed: "Yesterday" },
    { id: "BLP", name: "Hedge Management",                       area: "Treasury",                  steps: 142, granularity: "Fine",   verdict: "Has Gaps",              classification: "Gap",           reqs: 9,  lastReviewed: "Today" },

    // Sourcing & Procurement
    { id: "BLN", name: "Procurement of Direct Materials",        area: "Sourcing & Procurement",    steps: 528, granularity: "Coarse", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 29, lastReviewed: "5 days ago" },
    { id: "18J", name: "Procurement of Services",                area: "Sourcing & Procurement",    steps: 312, granularity: "Medium", verdict: "Mostly Configuration",  classification: "Configuration", reqs: 18, lastReviewed: "4 days ago" },
    { id: "BMR", name: "Operational Contract Management",        area: "Sourcing & Procurement",    steps: 246, granularity: "Medium", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 16, lastReviewed: "1 week ago" },
    { id: "BMC", name: "Source-to-Contract",                     area: "Sourcing & Procurement",    steps: 198, granularity: "Medium", verdict: "Pending",               classification: "Pending",       reqs: 12, lastReviewed: "Never" },

    // Sales
    { id: "BMD", name: "Sales Order Processing",                 area: "Sales",                     steps: 678, granularity: "Coarse", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 35, lastReviewed: "6 days ago" },
    { id: "BD9", name: "Returns Management",                     area: "Sales",                     steps: 224, granularity: "Medium", verdict: "Has Gaps",              classification: "Gap",           reqs: 12, lastReviewed: "Today" },
    { id: "BKA", name: "Sales Contract Management",              area: "Sales",                     steps: 286, granularity: "Medium", verdict: "Mostly Configuration",  classification: "Configuration", reqs: 14, lastReviewed: "1 week ago" },
    { id: "BD3", name: "Sales Rebate Processing",                area: "Sales",                     steps: 192, granularity: "Fine",   verdict: "Has Gaps",              classification: "Gap",           reqs: 10, lastReviewed: "Yesterday" },

    // Manufacturing
    { id: "1MI", name: "Production Planning",                    area: "Manufacturing",             steps: 884, granularity: "Coarse", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 41, lastReviewed: "1 week ago" },
    { id: "BJE", name: "Quality Management",                     area: "Manufacturing",             steps: 396, granularity: "Medium", verdict: "Mostly Configuration",  classification: "Configuration", reqs: 16, lastReviewed: "1 week ago" },
    { id: "BJ5", name: "Make-to-Stock",                          area: "Manufacturing",             steps: 421, granularity: "Coarse", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 22, lastReviewed: "1 week ago" },
    { id: "BJN", name: "Make-to-Order",                          area: "Manufacturing",             steps: 354, granularity: "Medium", verdict: "Mostly Configuration",  classification: "Configuration", reqs: 19, lastReviewed: "1 week ago" },

    // Supply Chain
    { id: "BJK", name: "Inventory Management",                   area: "Supply Chain",              steps: 712, granularity: "Coarse", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 32, lastReviewed: "1 week ago" },
    { id: "1JI", name: "Warehouse Management",                   area: "Supply Chain",              steps: 542, granularity: "Medium", verdict: "Mostly Configuration",  classification: "Configuration", reqs: 21, lastReviewed: "1 week ago" },
    { id: "BJ8", name: "Outbound Logistics",                     area: "Supply Chain",              steps: 318, granularity: "Medium", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 17, lastReviewed: "Yesterday" },
    { id: "BJL", name: "Inbound Logistics",                      area: "Supply Chain",              steps: 271, granularity: "Medium", verdict: "Mostly Configuration",  classification: "Configuration", reqs: 14, lastReviewed: "Yesterday" },

    // Human Resources
    { id: "BNX", name: "Workforce Management",                   area: "Human Resources",           steps: 318, granularity: "Coarse", verdict: "Has Gaps",              classification: "Gap",           reqs: 15, lastReviewed: "2 weeks ago" },
    { id: "BS4", name: "Time & Attendance",                      area: "Human Resources",           steps: 194, granularity: "Medium", verdict: "Pending",               classification: "Pending",       reqs: 11, lastReviewed: "Never" },

    // Project Services
    { id: "BGC", name: "Project Control — Finance",              area: "Project Services",          steps: 268, granularity: "Medium", verdict: "Mostly FIT",            classification: "OOTB",          reqs: 13, lastReviewed: "3 days ago" },
    { id: "1A1", name: "Customer Project Management",            area: "Project Services",          steps: 312, granularity: "Medium", verdict: "Pending",               classification: "Pending",       reqs: 0,  lastReviewed: "Never" },
  ];

  // ─── Requirements: 30 entries spanning the scope ───────────────────
  const REQS = [
    // Finance — AP / AR / GL / Asset / Tax
    { id: "REQ-001", code: "FIN-AP-001", text: "System must support 3-way match for vendor invoices against PO and GR.",                                                                                                                          area: "Finance", scopeId: "J60", classification: "OOTB",          mandatory: true,  remarks: "Standard SAP capability." },
    { id: "REQ-002", code: "FIN-AP-002", text: "Automatic payment proposal with multi-currency netting across MYR / USD / SGD.",                                                                                                                  area: "Finance", scopeId: "J60", classification: "Configuration", mandatory: true,  remarks: "Requires SSCUI 100247 (Payment methods)." },
    { id: "REQ-003", code: "FIN-AP-003", text: "Vendor portal for invoice submission and status tracking.",                                                                                                                                       area: "Finance", scopeId: "J60", classification: "Gap",           mandatory: false, remarks: "Requires SAP Ariba SLP — separate product, not in scope." },
    { id: "REQ-004", code: "FIN-AR-001", text: "Customer credit checking with automatic block release on payment receipt.",                                                                                                                       area: "Finance", scopeId: "J62", classification: "OOTB",          mandatory: true,  remarks: "" },
    { id: "REQ-005", code: "FIN-AR-002", text: "Dunning correspondence in Bahasa Malaysia for retail customers.",                                                                                                                                  area: "Finance", scopeId: "J62", classification: "Configuration", mandatory: true,  remarks: "Requires SmartForm translation." },
    { id: "REQ-006", code: "FIN-GL-001", text: "Parallel ledgers for IFRS and Malaysian Financial Reporting Standards (MFRS).",                                                                                                                    area: "Finance", scopeId: "1GA", classification: "OOTB",          mandatory: true,  remarks: "" },
    { id: "REQ-007", code: "FIN-GL-002", text: "Real-time consolidation of 14 legal entities including 3 overseas subsidiaries.",                                                                                                                  area: "Finance", scopeId: "1GA", classification: "Configuration", mandatory: true,  remarks: "Group reporting with currency translation." },
    { id: "REQ-008", code: "FIN-AA-001", text: "Asset depreciation per Malaysian Inland Revenue Board (LHDN) capital allowance schedules.",                                                                                                        area: "Finance", scopeId: "1J2", classification: "Configuration", mandatory: true,  remarks: "Custom depreciation key." },
    { id: "REQ-009", code: "FIN-AA-002", text: "Asset retirement with photo evidence and digital sign-off from Plant Manager.",                                                                                                                    area: "Finance", scopeId: "1J2", classification: "Gap",           mandatory: false, remarks: "Mobile workflow not standard — workaround via Workflow Inbox." },
    { id: "REQ-010", code: "FIN-TX-001", text: "SST (Sales & Service Tax 8%) calculation on services and 6% on goods, with quarterly LHDN reporting.",                                                                                             area: "Finance", scopeId: "1GO", classification: "Configuration", mandatory: true,  remarks: "Tax codes Z1/Z2 plus DRC report." },

    // Treasury — Cash / BAM / Hedging
    { id: "REQ-011", code: "TRY-CM-001", text: "Real-time cash position across 14 bank accounts in 3 currencies.",                                                                                                                                area: "Treasury", scopeId: "BFA", classification: "OOTB",          mandatory: true,  remarks: "" },
    { id: "REQ-012", code: "TRY-CM-002", text: "Forex hedging for MYR / USD / SGD exposure tracking with mark-to-market valuation.",                                                                                                              area: "Treasury", scopeId: "BFA", classification: "Gap",           mandatory: true,  remarks: "Needs SAP Analytics Cloud + custom hedge accounting." },
    { id: "REQ-013", code: "TRY-CM-003", text: "Daily cash forecast aggregating AP, AR and Treasury positions for next 90 days.",                                                                                                                  area: "Treasury", scopeId: "BFA", classification: "Configuration", mandatory: true,  remarks: "Standard with liquidity planner config." },
    { id: "REQ-014", code: "TRY-BAM-001", text: "Bank statement import via SWIFT MT940 from 6 partner banks.",                                                                                                                                     area: "Treasury", scopeId: "1MC", classification: "Configuration", mandatory: true,  remarks: "" },
    { id: "REQ-015", code: "TRY-BAM-002", text: "Two-factor approval on all outgoing payments above MYR 50,000.",                                                                                                                                  area: "Treasury", scopeId: "1MC", classification: "OOTB",          mandatory: true,  remarks: "Approval workflow standard." },
    { id: "REQ-016", code: "TRY-LM-001", text: "Liquidity item hierarchy aligned with Bursa group reporting requirements.",                                                                                                                        area: "Treasury", scopeId: "1XF", classification: "Configuration", mandatory: true,  remarks: "" },
    { id: "REQ-017", code: "TRY-HM-001", text: "Designation and effectiveness testing of cash flow hedges per MFRS 9.",                                                                                                                            area: "Treasury", scopeId: "BLP", classification: "Gap",           mandatory: false, remarks: "Bursa internal hedge desk uses external system; integration pending." },

    // Procurement
    { id: "REQ-018", code: "PRC-PO-001", text: "Multi-level PO approval based on amount thresholds (5 levels up to MYR 5M).",                                                                                                                      area: "Sourcing & Procurement", scopeId: "BLN", classification: "OOTB",          mandatory: true,  remarks: "" },
    { id: "REQ-019", code: "PRC-PO-002", text: "Supplier qualification questionnaire integrated with onboarding workflow.",                                                                                                                        area: "Sourcing & Procurement", scopeId: "BLN", classification: "Configuration", mandatory: true,  remarks: "" },
    { id: "REQ-020", code: "PRC-SR-001", text: "Service entry sheet with mobile capture for on-site contractor work.",                                                                                                                             area: "Sourcing & Procurement", scopeId: "18J", classification: "Configuration", mandatory: true,  remarks: "Fiori standard works on iPad/iPhone." },
    { id: "REQ-021", code: "PRC-CT-001", text: "Operational contract with milestone-based release schedules.",                                                                                                                                     area: "Sourcing & Procurement", scopeId: "BMR", classification: "OOTB",          mandatory: true,  remarks: "" },

    // Sales
    { id: "REQ-022", code: "SAL-OM-001", text: "Sales order entry with availability check (ATP) across 4 distribution centers.",                                                                                                                   area: "Sales", scopeId: "BMD", classification: "OOTB",          mandatory: true,  remarks: "" },
    { id: "REQ-023", code: "SAL-OM-002", text: "Order pricing with volume discounts, customer-specific contracts and rebate accruals.",                                                                                                            area: "Sales", scopeId: "BMD", classification: "Configuration", mandatory: true,  remarks: "Condition tables Z001–Z008." },
    { id: "REQ-024", code: "SAL-RT-001", text: "Returns authorization with photo evidence upload from delivery driver app.",                                                                                                                       area: "Sales", scopeId: "BD9", classification: "Gap",           mandatory: false, remarks: "Mobile capture not standard — option: Field Service Lite." },
    { id: "REQ-025", code: "SAL-CT-001", text: "Sales contract with quarterly volume reconciliation and automatic credit memos.",                                                                                                                  area: "Sales", scopeId: "BKA", classification: "Configuration", mandatory: true,  remarks: "" },
    { id: "REQ-026", code: "SAL-RB-001", text: "Multi-tier customer rebates with retroactive recalculation on contract amendment.",                                                                                                                area: "Sales", scopeId: "BD3", classification: "Gap",           mandatory: true,  remarks: "Rebate engine enhancements required." },

    // Supply Chain
    { id: "REQ-027", code: "SCM-IM-001", text: "Cycle counting with handheld terminal integration for 6 warehouses.",                                                                                                                              area: "Supply Chain", scopeId: "BJK", classification: "Configuration", mandatory: true,  remarks: "" },
    { id: "REQ-028", code: "SCM-WM-001", text: "EWM Basic — bin management, 2-step picking, packing.",                                                                                                                                             area: "Supply Chain", scopeId: "1JI", classification: "OOTB",          mandatory: true,  remarks: "" },

    // HR / Project
    { id: "REQ-029", code: "HCM-WF-001", text: "Workforce headcount planning with cost-center allocation.",                                                                                                                                        area: "Human Resources", scopeId: "BNX", classification: "Gap",           mandatory: true,  remarks: "Needs SAP SuccessFactors EC integration — separate workstream." },
    { id: "REQ-030", code: "PSV-PC-001", text: "Project actuals captured against WBS for billable engagements.",                                                                                                                                   area: "Project Services", scopeId: "BGC", classification: "OOTB",          mandatory: true,  remarks: "" },
  ];

  // ─── Reports — categorised by audience for the bundle vs per-report opinion test ───
  const REPORTS = [
    // Executive (board / steering committee)
    { id: 1,  name: "Executive Summary",                size: "142 KB", format: "PDF",  category: "Executive",     audience: "Executive", desc: "1-page summary for steering committee." },
    { id: 12, name: "Implementation Roadmap",           size: "212 KB", format: "PDF",  category: "Planning",      audience: "Executive", desc: "Phased rollout with key milestones and budget envelope." },
    { id: 9,  name: "OCM Impact Assessment",            size: "146 KB", format: "PDF",  category: "OCM",           audience: "Executive", desc: "Change-management impact across 14 legal entities." },
    { id: 10, name: "Risk Register",                    size: "62 KB",  format: "XLSX", category: "Risk",          audience: "Executive", desc: "Top 24 implementation risks with owner and mitigation." },

    // Technical (delivery team / SAP architects)
    { id: 2,  name: "Scope Catalog",                    size: "286 KB", format: "XLSX", category: "Scope",         audience: "Technical", desc: "All 142 SAP scope items with classification and granularity." },
    { id: 3,  name: "Gap Register",                     size: "104 KB", format: "XLSX", category: "Gaps",          audience: "Technical", desc: "32 gap requirements with proposed remediation paths." },
    { id: 4,  name: "Configuration Register",           size: "98 KB",  format: "XLSX", category: "Configuration", audience: "Technical", desc: "Configuration items with SSCUI references." },
    { id: 7,  name: "Integration Register",             size: "76 KB",  format: "XLSX", category: "Integration",   audience: "Technical", desc: "All inbound and outbound interfaces with target systems." },
    { id: 14, name: "Solution Architecture",            size: "428 KB", format: "PDF",  category: "Architecture",  audience: "Technical", desc: "End-to-end target architecture and integration topology." },
    { id: 6,  name: "Process Flow Diagrams",            size: "1.2 MB", format: "PDF",  category: "Process",       audience: "Technical", desc: "BPMN diagrams for in-scope end-to-end processes." },
    { id: 8,  name: "Data Migration Plan",              size: "188 KB", format: "PDF",  category: "Migration",     audience: "Technical", desc: "Mocks, mapping rules, cutover sequence." },

    // Audit / Compliance
    { id: 13, name: "Compliance Checklist",             size: "54 KB",  format: "PDF",  category: "Compliance",    audience: "Audit",     desc: "Bursa Securities compliance, MFRS, LHDN tax." },
    { id: 5,  name: "Requirements Traceability Matrix", size: "412 KB", format: "XLSX", category: "Scope",         audience: "Audit",     desc: "All 778 requirements traced to scope item, test case, gap." },
    { id: 11, name: "Test Strategy",                    size: "98 KB",  format: "PDF",  category: "Testing",       audience: "Audit",     desc: "UAT approach, entry/exit criteria, test phases." },
  ];

  // ─── Engagements (assessments) ───────────────────────────────
  const ASSESSMENTS = [
    {
      id: "bursa-malaysia",
      client: "Bursa Malaysia Berhad",
      country: "Malaysia",
      industry: "Financial Services",
      edition: "Public Cloud",
      status: "Active",
      stepStatus: "in_adjust",
      step: 4,
      lastTouched: "2h ago",
      lastTouchedFull: "April 24, 2026 · 14:32",
      coverage: { ootb: 62, config: 17, gap: 21 },
      requirements: 778,
      scopeItems: 142,
      complexity: "standard",
      owner: { name: "Maya Chen", initials: "MC" },
      created: "March 12, 2026",
      goLive: "October 2026",
      sme: { name: "Aliya Rahman", initials: "AR", title: "Head of Finance Transformation, Bursa Malaysia" },
    },
    {
      id: "petronas-finance",
      client: "Petronas Treasury",
      country: "Malaysia",
      industry: "Energy",
      edition: "Public Cloud",
      status: "Active",
      stepStatus: "in_analyze",
      step: 3,
      lastTouched: "Yesterday",
      coverage: { ootb: 48, config: 22, gap: 30 },
      requirements: 412,
      scopeItems: 89,
      complexity: "standard",
      owner: { name: "Maya Chen", initials: "MC" },
    },
    {
      id: "axiata-hr",
      client: "Axiata Group HR Transformation",
      country: "Malaysia",
      industry: "Telecommunications",
      edition: "Public Cloud",
      status: "Draft",
      stepStatus: "scoping",
      step: 2,
      lastTouched: "3 days ago",
      coverage: { ootb: 0, config: 0, gap: 0 },
      requirements: 0,
      scopeItems: 0,
      complexity: "small",
      owner: { name: "Maya Chen", initials: "MC" },
    },
    {
      id: "maybank-procurement",
      client: "Maybank Procurement Cloud",
      country: "Malaysia",
      industry: "Financial Services",
      edition: "Public Cloud",
      status: "Done",
      stepStatus: "handed_off",
      step: 5,
      lastTouched: "Last month",
      lastTouchedFull: "March 28, 2026",
      signedOffBy: "Linh Tran (Maybank Group CFO)",
      signedOffOn: "March 24, 2026",
      coverage: { ootb: 71, config: 19, gap: 10 },
      requirements: 643,
      scopeItems: 118,
      complexity: "standard",
      owner: { name: "David Park", initials: "DP" },
    },
    {
      id: "sime-darby-erp",
      client: "Sime Darby Plantation",
      country: "Malaysia",
      industry: "Agriculture",
      edition: "Public Cloud",
      status: "Active",
      stepStatus: "in_scope",
      step: 2,
      lastTouched: "2 weeks ago",
      coverage: { ootb: 0, config: 0, gap: 0 },
      requirements: 124,
      scopeItems: 41,
      complexity: "small",
      owner: { name: "Priya Nair", initials: "PN" },
    },
    {
      id: "tenaga-portfolio",
      client: "Tenaga Nasional Group",
      country: "Malaysia",
      industry: "Utilities",
      edition: "Public Cloud",
      status: "Active",
      stepStatus: "in_adjust",
      step: 4,
      lastTouched: "Yesterday",
      coverage: { ootb: 54, config: 24, gap: 22 },
      requirements: 3128,
      scopeItems: 412,
      complexity: "enterprise",
      owner: { name: "Maya Chen", initials: "MC" },
      portfolio: [
        { name: "Generation",  reqs: 982,  scope: 124 },
        { name: "Transmission", reqs: 714,  scope: 96 },
        { name: "Retail",      reqs: 891,  scope: 118 },
        { name: "Corporate",   reqs: 541,  scope: 74 },
      ],
    },
  ];

  // ─── Decision timeline (for #12 archive view) ────────────────
  const DECISIONS = [
    { date: "March 12, 2026", actor: "Maya Chen",   action: "Created assessment from APAC FSI template." },
    { date: "March 14, 2026", actor: "Aliya Rahman",action: "Confirmed scope: 14 legal entities, 4 distribution centers, MYR/USD/SGD." },
    { date: "March 18, 2026", actor: "Maya Chen",   action: "Imported 778 requirements from RFP_Bursa_2026.xlsx (12 sheets)." },
    { date: "March 22, 2026", actor: "Aptus AI",    action: "Classified 723 of 778 requirements (93%); 55 left to human-review." },
    { date: "March 23, 2026", actor: "Maya Chen",   action: "Reviewed all 55. Reclassified 18 from Gap → Configuration." },
    { date: "March 28, 2026", actor: "Aliya Rahman",action: "Signed off scope catalog. Approved 32 gaps, 4 deferred to Phase 2." },
    { date: "April 2, 2026",  actor: "David Park",  action: "Peer-reviewed Gap Register and Solution Architecture." },
    { date: "April 8, 2026",  actor: "Aliya Rahman",action: "Final sign-off: 14 reports approved. Engagement closed." },
  ];

  // ─── Help glossary (for #3 plain-language tooltips) ──────────
  const GLOSSARY = {
    "OOTB":          { term: "Out-of-the-box",         plain: "Works as standard SAP. No code or configuration changes needed beyond turning it on." },
    "Configuration": { term: "Configuration",          plain: "Adjustable through SAP's settings — no custom code, but the system needs to be tuned to match your process." },
    "Gap":           { term: "Gap",                    plain: "Standard SAP doesn't cover this. Either change the process, build a custom extension, or accept the limitation." },
    "FIT":           { term: "Fit",                    plain: "Your requirement matches what SAP already does." },
    "SSCUI":         { term: "SSCUI",                  plain: "A specific SAP setting Maya's team will adjust during configuration." },
    "Coarse":        { term: "Coarse granularity",     plain: "Reviewed at a high level — the whole capability." },
    "Medium":        { term: "Medium granularity",     plain: "Reviewed step-by-step — each piece of the process individually." },
    "Fine":          { term: "Fine granularity",       plain: "Reviewed at the detailed level — every variant and edge case." },
    "Mandatory":     { term: "Mandatory",              plain: "Bursa told us this requirement must be met for go-live." },
    "ATP":           { term: "Available-to-Promise",   plain: "When a salesperson takes an order, the system checks stock and reserves it." },
    "MFRS":          { term: "Malaysian FRS",          plain: "Malaysia's accounting standards — required for statutory reporting." },
    "LHDN":          { term: "LHDN",                   plain: "Malaysia's tax authority. Determines how tax is calculated and reported." },
    "SST":           { term: "Sales & Service Tax",    plain: "Malaysian indirect tax: 6% on goods, 8% on services." },
  };

  // ─── Empty/error/loading scenario catalog (for #1, #2) ───────
  const EMPTY_SCENARIOS = [
    { id: "no-assessments",  surface: "Home",                title: "Start your first assessment.",                 desc: "Upload an RFP, browse the SAP 2602 catalog, or build manually.",            cta: "+ New assessment",         secondary: "Browse templates" },
    { id: "no-scope",        surface: "Step 2 — Scope",      title: "Add scope to begin.",                          desc: "Drag in an RFP, browse the catalog of 582 SAP scope items, or pick a template.", cta: "Browse 2602 catalog",      secondary: "Upload spreadsheet" },
    { id: "no-reqs",         surface: "Step 3 — Analyze",    title: "Bring requirements in to analyze.",            desc: "Aptus reads RFPs, RFIs, and functional specs. Drop a file or paste a list.", cta: "Upload requirements",      secondary: "Paste from clipboard" },
    { id: "no-gaps",         surface: "Step 4 — Adjust · Gap filter",  title: "No gaps detected.",                  desc: "Every requirement maps to standard SAP. That's rare — double-check the AI verdicts.", cta: "Review verdicts",          secondary: "" },
    { id: "no-pending",      surface: "Step 3 — Pending tab", title: "AI classified everything.",                   desc: "All 778 requirements have a verdict. Review them in Adjust.",               cta: "Continue to Adjust",        secondary: "" },
    { id: "no-integrations", surface: "Integration register",title: "No integrations defined yet.",                 desc: "List inbound and outbound interfaces so we can include them in the bundle.", cta: "+ Add integration",         secondary: "Import from XLSX" },
    { id: "no-reports",      surface: "Recent reports",      title: "Reports appear after Step 5.",                 desc: "Complete the analysis to generate the deliverable bundle.",                  cta: "Continue to Step 5",       secondary: "" },
    { id: "no-templates",    surface: "Templates",           title: "No templates in your workspace.",              desc: "Templates speed up new engagements. Save one from any completed assessment.",cta: "Save current as template", secondary: "Browse public library" },
    { id: "no-search",       surface: "Search results",      title: "Nothing matches \u201Czzzzzz\u201D.",          desc: "Try a different term, or use Cmd+K to search across assessments and commands.", cta: "Clear search",             secondary: "" },
    { id: "no-archive",      surface: "Archived",            title: "Nothing archived yet.",                        desc: "Completed engagements move here automatically 30 days after sign-off.",      cta: "View active assessments", secondary: "" },
    { id: "no-team",         surface: "Settings · Team",     title: "It's just you in this workspace.",             desc: "Invite colleagues so they can co-edit assessments and review gaps.",         cta: "Invite teammate",          secondary: "Learn about workspaces" },
  ];

  // ─── Keep your existing references intact ───────────────────
  window.APTUS_DATA = {
    user: { name: "Maya Chen", email: "maya@abeam.com", initials: "MC", role: "Lead Consultant" },
    assessments: ASSESSMENTS,
    scopeItems: SCOPE,
    requirements: REQS,
    reports: REPORTS,
    decisions: DECISIONS,
    glossary: GLOSSARY,
    emptyScenarios: EMPTY_SCENARIOS,
    recentReports: [
      { name: "Bursa_Malaysia_Berhad_Bundle.zip", size: "1.3 MB", time: "2h ago",     assessment: "Bursa Malaysia Berhad" },
      { name: "Maybank_Procurement_Bundle.zip",   size: "1.1 MB", time: "Last month", assessment: "Maybank Procurement Cloud" },
      { name: "Tenaga_Group_Executive_Pack.pdf",  size: "684 KB", time: "Yesterday",  assessment: "Tenaga Nasional Group" },
    ],
  };
})();
