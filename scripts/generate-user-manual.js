const fs = require("fs");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, BorderStyle, AlignmentType, PageBreak, TabStopPosition, TabStopType } = require("docx");

// ─── Helpers ───
const border = { style: BorderStyle.SINGLE, size: 1, color: "D9D9D9" };
const borders = { top: border, bottom: border, left: border, right: border };
const F = "Calibri";

function h1(t) { return new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 32, font: F, color: "0854A0" })], heading: HeadingLevel.HEADING_1, spacing: { before: 500, after: 200 } }); }
function h2(t) { return new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 26, font: F })], heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 150 } }); }
function h3(t) { return new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 22, font: F })], heading: HeadingLevel.HEADING_3, spacing: { before: 300, after: 100 } }); }
function p(t) { return new Paragraph({ children: [new TextRun({ text: t, size: 21, font: F })], spacing: { after: 120 } }); }
function bp(label, text) { return new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 21, font: F }), new TextRun({ text, size: 21, font: F })], spacing: { after: 100 } }); }
function bull(t) { return new Paragraph({ children: [new TextRun({ text: t, size: 21, font: F })], bullet: { level: 0 }, spacing: { after: 60 } }); }
function bull2(t) { return new Paragraph({ children: [new TextRun({ text: t, size: 21, font: F })], bullet: { level: 1 }, spacing: { after: 60 } }); }
function num(n, t) { return new Paragraph({ children: [new TextRun({ text: n + ". ", bold: true, size: 21, font: F }), new TextRun({ text: t, size: 21, font: F })], spacing: { after: 80 }, indent: { left: 300 } }); }
function tip(t) { return new Paragraph({ children: [new TextRun({ text: "Tip: ", bold: true, size: 21, font: F, color: "0854A0" }), new TextRun({ text: t, size: 21, font: F, italics: true })], spacing: { after: 120 }, indent: { left: 400 } }); }
function note(t) { return new Paragraph({ children: [new TextRun({ text: "Important: ", bold: true, size: 21, font: F, color: "B00000" }), new TextRun({ text: t, size: 21, font: F })], spacing: { after: 120 }, indent: { left: 400 } }); }
function sp() { return new Paragraph({ spacing: { after: 150 } }); }
function pb() { return new Paragraph({ children: [new PageBreak()] }); }

function tbl(headers, rows) {
  const hr = new TableRow({
    children: headers.map(h => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 19, font: F, color: "FFFFFF" })], alignment: AlignmentType.LEFT })],
      shading: { fill: "0854A0" }, borders, width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
    })),
    tableHeader: true,
  });
  const dr = rows.map((r, i) => new TableRow({
    children: r.map(c => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: String(c), size: 19, font: F })], alignment: AlignmentType.LEFT })],
      shading: { fill: i % 2 === 0 ? "F5F6F7" : "FFFFFF" }, borders,
    })),
  }));
  return new Table({ rows: [hr, ...dr], width: { size: 100, type: WidthType.PERCENTAGE } });
}

// ─── Build Document ───
const c = [];

// Title Page
c.push(new Paragraph({ spacing: { before: 3000 } }));
c.push(new Paragraph({ children: [new TextRun({ text: "ABeam", bold: true, size: 72, font: F, color: "0854A0" })], alignment: AlignmentType.CENTER }));
c.push(new Paragraph({ children: [new TextRun({ text: "SAP S/4HANA Cloud Fit-to-Standard Assessment Platform", size: 28, font: F, color: "666666" })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
c.push(new Paragraph({ children: [new TextRun({ text: "End-User Manual", bold: true, size: 40, font: F })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }));
c.push(new Paragraph({ children: [new TextRun({ text: "Complete Guide for All Roles", size: 24, font: F, color: "666666" })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }));
c.push(new Paragraph({ children: [new TextRun({ text: "Version 2.1  |  March 2026", size: 22, font: F, color: "999999" })], alignment: AlignmentType.CENTER }));
c.push(new Paragraph({ children: [new TextRun({ text: "CONFIDENTIAL", size: 20, font: F, color: "B00000", bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
c.push(pb());

// ═══════════════════════════════════════════════════════════════
// SECTION 1: PLATFORM OVERVIEW
// ═══════════════════════════════════════════════════════════════
c.push(h1("1. Platform Overview"));
c.push(p("ABeam is a web-based platform that digitizes the SAP S/4HANA Cloud Fit-to-Standard assessment process. It replaces manual spreadsheet-based workflows with a structured, collaborative portal where consulting partners and their clients evaluate SAP Best Practices catalog items against current business processes."));
c.push(p("The platform supports the full assessment lifecycle from initial company profiling and scope selection through step-by-step process review, gap resolution, register management, validation, executive sign-off, and ALM handoff."));
c.push(sp());

c.push(h2("1.1 Key Capabilities"));
c.push(bull("Passkey-first authentication with phishing-resistant WebAuthn biometrics"));
c.push(bull("Template-first scope selection with ABeam CoreEdge and industry presets"));
c.push(bull("Enriched company profile with operating model, regulatory, and SAP landscape capture"));
c.push(bull("Industry-guided scope selection with dependency tracking and bulk operations"));
c.push(bull("Decision-first step classification with content parsing and step grouping"));
c.push(bull("Gap resolution with cost modeling, risk scoring, and what-if scenarios"));
c.push(bull("Integration, Data Migration, and OCM impact registers"));
c.push(bull("11-role access control system with area-locked permissions"));
c.push(bull("10-state assessment lifecycle with formal gating between phases"));
c.push(bull("Real-time collaboration with comments, @mentions, field locks, and conflict detection"));
c.push(bull("Workshop management with QR join, live polling, projector mode, and minutes"));
c.push(bull("Conversation Mode for business-friendly guided classification"));
c.push(bull("Interactive guided tours (18 tours) with Driver.js spotlight overlays"));
c.push(bull("Admin user management with invite codes, role changes, MFA reset"));
c.push(bull("Report generation with branding and readiness scorecards"));
c.push(bull("PWA with offline capability and mobile-responsive design"));
c.push(sp());

c.push(h2("1.2 Assessment Lifecycle States"));
c.push(p("Every assessment progresses through a 10-state lifecycle. Transitions between states are role-gated and require specific conditions to be met."));
c.push(tbl(["Status", "Description", "Who Can Advance"], [
  ["Draft", "Initial state. Company profile and basic setup.", "Consultant, Partner Lead, Platform Admin"],
  ["Scoping", "Scope selection is active. Select SAP best practice items.", "Consultant, Partner Lead, Platform Admin"],
  ["In Progress", "Process review active. Classify steps as FIT/CONFIGURE/GAP/NA.", "Consultant, Platform Admin"],
  ["Workshop Active", "Live workshop session underway with synchronized navigation.", "Consultant, Solution Architect, Platform Admin"],
  ["Review Cycle", "Consultant reviewing client inputs before proceeding.", "Consultant, Platform Admin"],
  ["Gap Resolution", "Addressing identified gaps with resolution strategies.", "Consultant, Platform Admin"],
  ["Pending Validation", "All work complete, awaiting formal validation.", "Consultant, Partner Lead"],
  ["Reviewed", "Validated by all parties, ready for sign-off.", "Executive Sponsor, Partner Lead"],
  ["Signed Off", "Formally signed off with cryptographic verification.", "Platform Admin"],
  ["Archived", "Assessment archived for historical reference.", "Platform Admin"],
]));
c.push(pb());

// ═══════════════════════════════════════════════════════════════
// SECTION 2: AUTHENTICATION & SECURITY
// ═══════════════════════════════════════════════════════════════
c.push(h1("2. Authentication & Security"));

c.push(h2("2.1 Sign-In Methods"));
c.push(p("ABeam supports three sign-in methods, all designed around passkey-first security:"));
c.push(sp());
c.push(h3("Passkey (Primary — Recommended)"));
c.push(p("Passkeys use your device's fingerprint sensor, face recognition, or PIN to verify your identity. They are phishing-resistant, device-bound, and the fastest way to sign in."));
c.push(num("1", "Go to the login page"));
c.push(num("2", "Click \"Sign in with passkey\""));
c.push(num("3", "Complete the biometric prompt (fingerprint, face, or PIN)"));
c.push(num("4", "You are signed in — no additional verification needed"));
c.push(sp());

c.push(h3("Magic Link (Email)"));
c.push(p("For users without a passkey set up, or when using a new device:"));
c.push(num("1", "Enter your email address and click Continue"));
c.push(num("2", "Check your inbox for the sign-in email from ABeam"));
c.push(num("3", "Click the sign-in link in the email"));
c.push(num("4", "You are signed in (new users will be asked to register a passkey)"));
c.push(tip("Check your spam/junk folder if the email doesn't arrive within a minute."));
c.push(sp());

c.push(h3("Invite Code (Admin-Issued)"));
c.push(p("For early testers or when email delivery is unreliable, administrators can issue a 6-digit invite code:"));
c.push(num("1", "Click \"Sign in with invite code\" on the login page"));
c.push(num("2", "Enter your email address"));
c.push(num("3", "Enter the 6-digit code provided by your administrator (format: XXX-XXX)"));
c.push(num("4", "Click \"Verify & Sign In\""));
c.push(note("Invite codes are single-use and expire after 48 hours. Contact your administrator for a new code if needed."));
c.push(sp());

c.push(h2("2.2 Mandatory Passkey Registration"));
c.push(p("All new users must register a passkey before accessing the platform. This applies regardless of how you first signed in (magic link or invite code)."));
c.push(p("On your first login, you will see the \"Secure Your Account\" page with two options:"));
c.push(bp("Passkey (Recommended) — ", "Use your fingerprint, face, or device PIN. One-tap future logins."));
c.push(bp("Authenticator App (Fallback) — ", "Use Google Authenticator or Authy for 6-digit TOTP codes. Only if your browser doesn't support passkeys."));
c.push(p("After registering, future logins via passkey go straight to the portal — no additional verification step."));
c.push(sp());

c.push(h2("2.3 Security Architecture"));
c.push(tbl(["Feature", "Detail"], [
  ["Passkey = Full Trust", "Users with a registered passkey skip all MFA checks, regardless of login method"],
  ["Session Management", "Single concurrent session per user. New logins revoke previous sessions."],
  ["Session Duration", "24 hours. Automatically extended on activity."],
  ["Challenge Protection", "WebAuthn challenges are HMAC-signed, timestamped, and single-use (5-minute TTL)"],
  ["Rate Limiting", "Auth endpoints: 30 requests/minute. MFA verify: 10 attempts/5 minutes."],
  ["Content Security Policy", "Strict CSP with script-src 'self' 'unsafe-inline'. No strict-dynamic."],
]));
c.push(pb());

// ═══════════════════════════════════════════════════════════════
// SECTION 3: ROLES
// ═══════════════════════════════════════════════════════════════
c.push(h1("3. User Roles"));
c.push(p("ABeam uses an 11-role access control system. Each role has specific permissions and sees a tailored interface."));
c.push(tbl(["Role", "Description", "MFA Required"], [
  ["Platform Admin", "Full platform access. Manage users, organizations, SAP catalog, all assessments.", "Optional"],
  ["Partner Lead", "Manage assessments across organizations. Subscription management.", "Optional"],
  ["Consultant", "Create and run assessments. Primary assessment workflow role.", "Yes (passkey or TOTP)"],
  ["Solution Architect", "Technical review of process steps, configurations, and integrations.", "Yes"],
  ["Project Manager", "Oversight of assessment progress, workshops, and change management.", "Yes"],
  ["Process Owner", "Review and validate process steps for their assigned functional area.", "Yes"],
  ["IT Lead", "Review integrations, data migration, and IT landscape.", "Yes"],
  ["Data Migration Lead", "Manage data transfer planning, volumes, cleansing, and dependencies.", "Yes"],
  ["Executive Sponsor", "High-level review, sign-off, and strategic decisions.", "Yes"],
  ["Client Admin", "Manage their organization's users, settings, and SSO configuration.", "Yes"],
  ["Viewer", "Read-only access to assessments.", "Yes"],
]));
c.push(sp());

c.push(h2("3.1 First User"));
c.push(p("The very first user to sign up is automatically assigned the Platform Admin role. All subsequent users default to the Consultant role unless changed by an admin."));
c.push(pb());

// ═══════════════════════════════════════════════════════════════
// SECTION 4: GETTING STARTED
// ═══════════════════════════════════════════════════════════════
c.push(h1("4. Getting Started"));

c.push(h2("4.1 Creating Your First Assessment"));
c.push(p("From the Assessments page, you have two options:"));
c.push(sp());

c.push(h3("ABeam CoreEdge (Quick Start)"));
c.push(p("A pre-configured assessment template for essential finance processes:"));
c.push(num("1", "Click the \"ABeam CoreEdge\" button on the Assessments page"));
c.push(num("2", "Review the scope items — 4 core items are pre-selected:"));
c.push(sp());
c.push(tbl(["ID", "Scope Item", "Steps", "Effort"], [
  ["J58", "Accounting and Financial Close", "710", "Very High"],
  ["J60", "Accounts Payable", "714", "High"],
  ["BFA", "Basic Bank Account Management", "319", "Medium"],
  ["J62", "Asset Accounting", "330", "Medium"],
]));
c.push(sp());
c.push(p("Optional add-ons you can toggle on:"));
c.push(tbl(["ID", "Scope Item", "Steps", "Effort"], [
  ["BFB", "Basic Cash Operations", "323", "Medium"],
  ["1EG", "Bank Integration with File Interface", "101", "Low"],
  ["J54", "Overhead Cost Accounting", "179", "Low"],
]));
c.push(sp());
c.push(num("3", "Fill in Company Name (required), industry, and country"));
c.push(num("4", "Click \"Create Assessment\""));
c.push(sp());

c.push(h3("Custom Assessment"));
c.push(p("Click \"New Assessment\" for full control. Fill in company details and select scope items manually on the next page."));
c.push(sp());

c.push(h2("4.2 Company Profile"));
c.push(p("After creating an assessment, complete the company profile. The profile has 5 sections:"));
c.push(bull("Basic Information — Company name, industry, country, size"));
c.push(bull("Financial & Scale — Revenue, employee count, operational sites"));
c.push(bull("SAP Strategy — Deployment model, target go-live, SAP modules"));
c.push(bull("Operational Context — Key processes, operating countries"));
c.push(bull("IT Landscape — Current ERP, infrastructure summary"));
c.push(p("Reach 60% completion to unlock scope selection. The progress bar shows your completion percentage."));
c.push(tip("Save happens automatically as you fill in fields."));
c.push(pb());

// ═══════════════════════════════════════════════════════════════
// SECTION 5: SCOPE SELECTION
// ═══════════════════════════════════════════════════════════════
c.push(h1("5. Scope Selection"));

c.push(h2("5.1 Template Gateway"));
c.push(p("When you first visit the Scope page with no items selected, you see the Template Gateway — a clean starting point with three choices:"));
c.push(sp());
c.push(bp("ABeam CoreEdge (Recommended) — ", "Pre-selects 4 essential finance scope items. One click to get started."));
c.push(bp("Industry Template — ", "Pre-selects scope items based on your company's industry (e.g., Manufacturing, Retail). Count shown."));
c.push(bp("Browse Full Catalog — ", "Skip templates and browse all ~560 scope items. For experienced consultants."));
c.push(p("After applying a template, you land on the full scope page with your items pre-selected and categories expanded."));
c.push(sp());

c.push(h2("5.2 Scope Page Layout"));
c.push(p("The scope page organizes ~560 SAP Best Practice items into functional areas (Finance, Sales, Procurement, etc.). Each area is a collapsible section:"));
c.push(bull("Areas with selected items are expanded by default"));
c.push(bull("Areas with no selections are collapsed, showing \"X/Y selected\" count"));
c.push(bull("Click any area header to expand/collapse"));
c.push(bull("\"Select All\" / \"Deselect All\" buttons per area for bulk operations"));
c.push(sp());

c.push(h2("5.3 Scope Item Details"));
c.push(p("Each scope item card shows:"));
c.push(bull("Checkbox — Toggle selection (YES/NO/MAYBE)"));
c.push(bull("Item ID and name — e.g., J60 Accounts Payable"));
c.push(bull("Step count — Total process steps and classifiable steps"));
c.push(bull("Effort tier — Very High, High, Medium, Low"));
c.push(bull("Info button — Opens the Briefing Panel with full details"));
c.push(sp());

c.push(h2("5.4 Briefing Panel"));
c.push(p("Click the info button on any scope item to see its Briefing Panel:"));
c.push(bull("What This Covers — Summary of the SAP process"));
c.push(bull("How the Review Is Structured — Process areas with step counts"));
c.push(bull("Questions to Discuss — Pre-review conversation starters"));
c.push(bull("Start Review button — Jump directly to reviewing this item"));
c.push(sp());

c.push(h2("5.5 Search, Filters & Views"));
c.push(bull("Search — Find items by name, ID, area, or sub-area"));
c.push(bull("Status filter — Show All, Selected only, Not selected, Maybe"));
c.push(bull("Area filter — Filter by functional area"));
c.push(bull("View toggle — List view (default, grouped categories) or Landscape view (process chain flows)"));
c.push(sp());

c.push(h2("5.6 Dependency Warnings"));
c.push(p("When you select a scope item that depends on another unselected item, a warning banner appears. Click \"Add\" to automatically include the missing dependency."));
c.push(sp());

c.push(h2("5.7 Impact Summary"));
c.push(p("When items are selected, a summary bar shows:"));
c.push(bull("Business Processes — Number of selected scope items"));
c.push(bull("Steps to Review — Classifiable process steps"));
c.push(bull("Total Steps — All process steps"));
c.push(bull("Est. Review Time — Estimated hours based on step count"));
c.push(pb());

// ═══════════════════════════════════════════════════════════════
// SECTION 6: ASSESSMENT WORKFLOW
// ═══════════════════════════════════════════════════════════════
c.push(h1("6. Assessment Workflow"));

c.push(h2("6.1 Step Review"));
c.push(p("For each selected scope item, review the SAP process steps:"));
c.push(bull("Select a scope item from the left sidebar"));
c.push(bull("Review each process step and classify it:"));
c.push(bull2("Fit — Matches your business process as-is"));
c.push(bull2("Configure — Needs SAP configuration to match"));
c.push(bull2("Gap — Does not fit, requires custom solution"));
c.push(bull2("N/A — Not applicable to your business"));
c.push(bull("Add notes to explain your classification decisions"));
c.push(bull("Progress is tracked per scope item and overall"));
c.push(sp());

c.push(h2("6.2 Configuration Matrix"));
c.push(p("Review and manage SAP configuration activities:"));
c.push(bull("Summary cards show Mandatory, Recommended, and Optional counts"));
c.push(bull("Toggle the Include checkbox to add/remove activities"));
c.push(bull("Filter by category, scope item, or self-service status"));
c.push(sp());

c.push(h2("6.3 Process Flows"));
c.push(p("Auto-generated process flow diagrams with color-coded status:"));
c.push(bull("Green — Fit (matches business)"));
c.push(bull("Blue — Configure (needs SAP config)"));
c.push(bull("Red — Gap (custom solution needed)"));
c.push(bull("Gray — N/A or Pending"));
c.push(sp());

c.push(h2("6.4 Process Map"));
c.push(p("Interactive overview of functional areas. Click any area card to drill down into its process flows and see fit analysis for each scope item."));
c.push(sp());

c.push(h2("6.5 Gap Resolution"));
c.push(p("All gaps identified during review are collected here:"));
c.push(bull("Each gap needs a resolution strategy"));
c.push(bull("Resolution options: Extend (custom dev), Configure (SAP config), Adapt (change business process), Accept (live with it)"));
c.push(bull("Track priority, cost estimates, and risk scores"));
c.push(sp());

c.push(h2("6.6 Registers"));
c.push(h3("System Connections (Integrations)"));
c.push(p("Document integration points between SAP and other systems. Track direction (inbound/outbound/bidirectional), type, status, and priority."));
c.push(sp());
c.push(h3("Data Transfer (Data Migration)"));
c.push(p("Catalog data objects being migrated. Track source systems, volumes, cleansing requirements, mapping complexity, and dependencies."));
c.push(sp());
c.push(h3("Change Impact (OCM)"));
c.push(p("Assess organizational change impacts per role and functional area. Track severity, training needs, and readiness status. Available in table and heatmap views."));
c.push(sp());

c.push(h2("6.7 Workshops"));
c.push(p("Schedule and manage workshop sessions:"));
c.push(bull("Create sessions with title, agenda, date/time"));
c.push(bull("Manage attendees and track participation"));
c.push(bull("Record action items and decisions"));
c.push(bull("QR code join for in-person participants"));
c.push(sp());

c.push(h2("6.8 Activity Log"));
c.push(p("Chronological timeline of all assessment changes. Filter by action type: step classifications, gaps, comments, conflicts, or status changes. Each entry shows who did what, when, and on which item."));
c.push(sp());

c.push(h2("6.9 Report & Sign-Off"));
c.push(p("After completing the review:"));
c.push(bull("Generate the assessment report with branding and readiness scorecards"));
c.push(bull("Initiate the formal sign-off process through five validation layers"));
c.push(bull("Export to ALM for implementation handoff"));
c.push(pb());

// ═══════════════════════════════════════════════════════════════
// SECTION 7: NAVIGATION
// ═══════════════════════════════════════════════════════════════
c.push(h1("7. Navigation"));

c.push(h2("7.1 Main Navigation"));
c.push(tbl(["Location", "What You Will Find"], [
  ["Dashboard", "Your KPIs, active assessments at a glance"],
  ["Assessments", "List of all assessments. Create new ones here (CoreEdge or custom)."],
  ["Analytics", "Cross-assessment benchmarks and comparisons"],
  ["Organization", "Organization settings, team management, subscription"],
  ["Admin", "Platform administration — users, catalog, data (admin only)"],
  ["Settings (user menu)", "Profile, security (passkeys/MFA), notifications"],
]));
c.push(sp());

c.push(h2("7.2 Assessment Tabs"));
c.push(p("Within an assessment, navigate using the stage tabs:"));
c.push(tbl(["Stage", "Sub-Tabs"], [
  ["Setup", "Profile, Scope"],
  ["Review", "Step Review, Conversation"],
  ["Results", "Config, Process Map, Flows, Gaps, Action Items"],
  ["Tracking", "System Connections, Data Transfer, Change Impact, Workshops"],
  ["Wrap-up", "Activity Log, Report, Sign-Off, Snapshots, Changes"],
]));
c.push(p("Stages unlock progressively. Review, Results, Tracking, and Wrap-up are locked until the assessment moves to In Progress status."));
c.push(sp());

c.push(h2("7.3 Guided Tours"));
c.push(p("Click the Tours button in the header to access interactive walkthroughs. 18 guided tours cover every major page:"));
c.push(tbl(["Tour", "What It Covers"], [
  ["Welcome to ABeam", "Navigation, search, account menu"],
  ["Company Profile", "Progress bar, form sections"],
  ["Scope Selection", "Process hierarchy, selection summary"],
  ["Step Review", "Sidebar, process step classification"],
  ["Gap Resolution", "Gap list, resolution options"],
  ["Configuration Matrix", "Summary cards, config table"],
  ["Process Flows", "Scope item list, flow diagram viewer"],
  ["Process Map", "Functional area drill-down"],
  ["System Connections", "Integration stats and table"],
  ["Data Transfer", "Migration stats and object table"],
  ["Change Impact", "OCM stats and impact register"],
  ["Workshops", "Workshop session cards"],
  ["Activity Log", "Filters and timeline"],
  ["Dashboard", "KPI metrics, active assessments"],
  ["Admin Panel", "Sidebar, platform statistics"],
  ["User Management", "User table, admin actions"],
  ["Organization", "Details, team members"],
  ["Security Settings", "Passkeys, two-factor authentication"],
]));
c.push(p("Tours auto-trigger on first visit. Dismissed tours can be replayed anytime from the Tours dropdown."));
c.push(sp());

c.push(h2("7.4 Quick Search"));
c.push(p("Press Cmd+K (Mac) or Ctrl+K (Windows) from anywhere to open the command palette. Search for scope items, assessments, or navigate to any page."));
c.push(pb());

// ═══════════════════════════════════════════════════════════════
// SECTION 8: ADMIN
// ═══════════════════════════════════════════════════════════════
c.push(h1("8. Administration"));

c.push(h2("8.1 User Management"));
c.push(p("Platform Admins can manage users from Admin > Users:"));
c.push(sp());
c.push(h3("Adding Users"));
c.push(num("1", "Click \"Add User\""));
c.push(num("2", "Enter full name, email address, and role"));
c.push(num("3", "Choose onboarding method:"));
c.push(bull2("Magic Link (default) — User receives sign-in email"));
c.push(bull2("Invite Code — System generates a 6-digit code you share manually"));
c.push(num("4", "Click \"Create User\" (or \"Create & Generate Code\")"));
c.push(p("For invite codes: a dialog shows the code (format: XXX-XXX), valid for 48 hours. Copy and share with the user."));
c.push(sp());

c.push(h3("Managing Users"));
c.push(tbl(["Action", "How", "Notes"], [
  ["Change Role", "Click role dropdown, select new role, confirm", "Revokes active sessions"],
  ["Deactivate", "Click person icon (orange)", "Blocks access immediately"],
  ["Reactivate", "Click refresh icon (green)", "Restores access"],
  ["Reset MFA", "Click shield icon", "Clears passkeys and authenticator"],
  ["Issue Invite Code", "Click # icon (for users who haven't logged in)", "Generates 6-digit code, 48h expiry"],
  ["Delete", "Click trash icon, confirm in dialog", "Permanent — removes all user data"],
]));
c.push(note("You cannot modify your own account. The last Platform Admin cannot be deactivated or deleted."));
c.push(sp());

c.push(h2("8.2 SAP Catalog Management"));
c.push(p("The SAP Best Practices catalog is the foundation of all assessments. Admins can:"));
c.push(bull("Ingest new catalog data via ZIP upload (Admin > ZIP Ingestion)"));
c.push(bull("Verify data integrity (Admin > Data Verification)"));
c.push(bull("Browse the catalog (Admin > SAP Catalog)"));
c.push(p("New SAP releases (quarterly) are ingested by uploading the latest catalog ZIP. The scope item version field tracks which SAP release each item belongs to. No code changes are needed for new releases."));
c.push(sp());

c.push(h2("8.3 Intelligence Layer"));
c.push(p("Configure AI-powered analysis features:"));
c.push(bull("Industries — Define industry profiles with applicable scope items for templates"));
c.push(bull("Effort Baselines — Set effort estimation benchmarks per scope item"));
c.push(bull("Extensibility Patterns — Define custom extension patterns"));
c.push(bull("Adaptation Patterns — Define business process adaptation strategies"));
c.push(sp());

c.push(h2("8.4 Organization Management"));
c.push(p("Manage organizations, SSO configuration, and subscription tiers:"));
c.push(bull("View all organizations and their assessment counts"));
c.push(bull("Configure SSO providers and domain policies"));
c.push(bull("Monitor subscription status and usage"));
c.push(pb());

// ═══════════════════════════════════════════════════════════════
// SECTION 9: TROUBLESHOOTING
// ═══════════════════════════════════════════════════════════════
c.push(h1("9. Troubleshooting"));
c.push(tbl(["Problem", "Solution"], [
  ["Cannot click buttons or links", "Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"],
  ["Sign-in email not arriving", "Check spam/junk folder. Ask admin to verify SMTP is configured."],
  ["Stuck on MFA verification page", "Ask a Platform Admin to reset your MFA from Admin > Users"],
  ["Passkey button is disabled", "Your browser may not support passkeys. Use Chrome, Edge, or Safari (latest)."],
  ["Invite code not working", "Code may have expired (48h limit) or been used. Ask admin for a new one."],
  ["Assessment stuck at Profile", "Complete at least 60% of profile fields to unlock Scope Selection."],
  ["Scope page shows nothing", "Select items from the Template Gateway, or click Browse Full Catalog."],
  ["Page shows \"Something went wrong\"", "Click Try Again. If persists, navigate to Dashboard and try again."],
  ["Cannot access Organization page", "Your account may not be linked to an organization yet. Create an assessment first."],
  ["Tours not appearing", "Tours auto-trigger on first visit. Click Tours button in header to replay."],
]));
c.push(sp());

// ═══════════════════════════════════════════════════════════════
// SECTION 10: QUICK REFERENCE
// ═══════════════════════════════════════════════════════════════
c.push(h1("10. Quick Reference"));
c.push(bull("Platform URL: https://aptus-sandy.vercel.app"));
c.push(bull("Login: https://aptus-sandy.vercel.app/login"));
c.push(bull("Supported browsers: Chrome, Edge, Safari, Firefox (latest versions)"));
c.push(bull("Mobile: Fully responsive — works on phones and tablets"));
c.push(bull("Quick search: Cmd+K (Mac) or Ctrl+K (Windows)"));
c.push(bull("Session duration: 24 hours"));
c.push(bull("Invite code validity: 48 hours, single-use"));
c.push(sp());

c.push(h2("10.1 Keyboard Shortcuts"));
c.push(tbl(["Shortcut", "Action"], [
  ["Cmd/Ctrl + K", "Open quick search / command palette"],
  ["Escape", "Close dialogs, overlays, and tours"],
]));
c.push(sp());

c.push(h2("10.2 Support"));
c.push(p("For technical issues, contact your Platform Administrator. For feature requests or feedback, use the Help widget (chat icon) in the bottom-right corner of the portal."));
c.push(sp());

// Footer
c.push(new Paragraph({ children: [new TextRun({ text: "End of Document", size: 18, font: F, color: "999999", italics: true })], alignment: AlignmentType.CENTER, spacing: { before: 400 } }));
c.push(new Paragraph({ children: [new TextRun({ text: "\u00A9 2026 ABeam. All rights reserved. CONFIDENTIAL.", size: 16, font: F, color: "CCCCCC" })], alignment: AlignmentType.CENTER }));

// ─── Build & Save ───
const doc = new Document({
  sections: [{
    properties: {
      page: {
        margin: { top: 1200, right: 1100, bottom: 1200, left: 1100 },
      },
    },
    children: c,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("ABeam-User-Manual-v2.1.docx", buffer);
  console.log("Created: ABeam-User-Manual-v2.1.docx (" + Math.round(buffer.length / 1024) + " KB)");
});
