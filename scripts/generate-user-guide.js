const fs = require("fs");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, BorderStyle, AlignmentType } = require("docx");

// Helpers
const border = { style: BorderStyle.SINGLE, size: 1, color: "D9D9D9" };
const borders = { top: border, bottom: border, left: border, right: border };

function h1(t) { return new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 32, font: "Calibri" })], heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }); }
function h2(t) { return new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 26, font: "Calibri" })], heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }); }
function h3(t) { return new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 22, font: "Calibri" })], heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }); }
function p(t) { return new Paragraph({ children: [new TextRun({ text: t, size: 21, font: "Calibri" })], spacing: { after: 120 } }); }
function bp(label, text) { return new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 21, font: "Calibri" }), new TextRun({ text, size: 21, font: "Calibri" })], spacing: { after: 120 } }); }
function bull(t) { return new Paragraph({ children: [new TextRun({ text: t, size: 21, font: "Calibri" })], bullet: { level: 0 }, spacing: { after: 80 } }); }
function tip(t) { return new Paragraph({ children: [new TextRun({ text: "Tip: ", bold: true, size: 21, font: "Calibri", color: "0854A0" }), new TextRun({ text: t, size: 21, font: "Calibri", italics: true })], spacing: { after: 120 }, indent: { left: 400 } }); }
function note(t) { return new Paragraph({ children: [new TextRun({ text: "Note: ", bold: true, size: 21, font: "Calibri", color: "B00000" }), new TextRun({ text: t, size: 21, font: "Calibri" })], spacing: { after: 120 }, indent: { left: 400 } }); }
function num(n, t) { return new Paragraph({ children: [new TextRun({ text: n + ". ", bold: true, size: 21, font: "Calibri" }), new TextRun({ text: t, size: 21, font: "Calibri" })], spacing: { after: 80 }, indent: { left: 300 } }); }
function sp() { return new Paragraph({ spacing: { after: 150 } }); }

function tbl(headers, rows) {
  const hr = new TableRow({
    children: headers.map(h => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, font: "Calibri", color: "FFFFFF" })], alignment: AlignmentType.LEFT })],
      shading: { fill: "0854A0" }, borders,
    })),
    tableHeader: true,
  });
  const dr = rows.map((r, i) => new TableRow({
    children: r.map(c => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: c, size: 20, font: "Calibri" })], alignment: AlignmentType.LEFT })],
      shading: { fill: i % 2 === 0 ? "F5F6F7" : "FFFFFF" }, borders,
    })),
  }));
  return new Table({ rows: [hr, ...dr], width: { size: 100, type: WidthType.PERCENTAGE } });
}

const c = [];

// Title
c.push(new Paragraph({ children: [new TextRun({ text: "ABeam", bold: true, size: 56, font: "Calibri", color: "0854A0" })], spacing: { after: 100 } }));
c.push(new Paragraph({ children: [new TextRun({ text: "User Guide — Internal Team", bold: true, size: 36, font: "Calibri" })], spacing: { after: 200 } }));
c.push(p("Platform: https://aptus-sandy.vercel.app"));
c.push(p("Last updated: 17 March 2026"));
c.push(sp());

// 1. Getting Started
c.push(h1("1. Getting Started"));

c.push(h2("1.1 Sign In"));
c.push(num("1", "Go to https://aptus-sandy.vercel.app/login"));
c.push(num("2", "Enter your work email address and click Continue"));
c.push(num("3", "Check your inbox for a sign-in email from ABeam"));
c.push(num("4", "Click the Sign In link in the email — you will be logged in automatically"));
c.push(tip("If the email does not arrive within a minute, check your spam folder."));

c.push(h2("1.2 Set Up Two-Factor Authentication (First Time Only)"));
c.push(p("On your first login, you will be asked to secure your account. Choose one:"));

c.push(h3("Option A — Passkey (Recommended)"));
c.push(num("1", "Click the Passkey card"));
c.push(num("2", "Click Add passkey"));
c.push(num("3", "Use your fingerprint, face scan, or device PIN when prompted"));
c.push(num("4", "Done — you are in"));

c.push(h3("Option B — Authenticator App"));
c.push(num("1", "Click the Authenticator App card"));
c.push(num("2", "Scan the QR code with Google Authenticator, Microsoft Authenticator, or Authy"));
c.push(num("3", "Enter the 6-digit code shown in your app"));
c.push(num("4", "Click Verify & Enable"));

c.push(h2("1.3 Returning Login"));
c.push(bull("With passkey: Click \"Sign in with passkey\" — one tap and you are in"));
c.push(bull("With authenticator: Sign in via email link, then enter your 6-digit code"));

// 2. Creating Assessment
c.push(h1("2. Creating Your First Assessment"));

c.push(h2("2.1 Quick Start — ABeam CoreEdge"));
c.push(num("1", "Go to Assessments (click \"Assessments\" in the top navigation)"));
c.push(num("2", "Click the ABeam CoreEdge button"));
c.push(num("3", "Review the scope items below — toggle items on or off"));
c.push(num("4", "Fill in your Company Name (required), industry, and country"));
c.push(num("5", "Click Create Assessment"));
c.push(sp());

c.push(p("Default scope items (pre-selected):"));
c.push(tbl(["Scope Item", "Description", "Effort"], [
  ["J58 — Accounting & Financial Close", "Month-end/year-end close, journals, reconciliation, financial statements", "Very High (710 steps)"],
  ["J60 — Accounts Payable", "Supplier invoices, payment runs/approval, down payments, AP reporting", "High (714 steps)"],
  ["BFA — Basic Bank Account Management", "Bank account lifecycle, bank master, bank G/L setup", "Medium (319 steps)"],
  ["J62 — Asset Accounting", "Fixed asset acquisition, depreciation, transfer, retirement, reporting", "Medium (330 steps)"],
]));
c.push(sp());

c.push(p("Optional add-ons (click to toggle on):"));
c.push(tbl(["Scope Item", "Description", "Effort"], [
  ["BFB — Basic Cash Operations", "Cash position, bank statements, memo records, value date", "Medium (323 steps)"],
  ["1EG — Bank Integration (File)", "Payment file generation, bank statement import for reconciliation", "Low (101 steps)"],
  ["J54 — Overhead Cost Accounting", "Cost center planning/posting, internal allocations, overhead analysis", "Low (179 steps)"],
]));
c.push(sp());

c.push(h2("2.2 Custom Assessment"));
c.push(p("If you need a different scope, click New Assessment instead. Fill in company details and configure your scope manually in the next step."));

// 3. Workflow
c.push(h1("3. Assessment Workflow"));
c.push(p("Once created, work through these stages in order:"));

c.push(h2("3.1 Setup"));
c.push(bp("Profile — ", "Fill in company details (industry, size, revenue, SAP modules). Reach 60% completion to unlock the next step."));
c.push(bp("Scope — ", "Select which SAP process areas to include. Browse the catalog and check/uncheck items."));

c.push(h2("3.2 Review"));
c.push(bp("Step Review — ", "For each scope item, review SAP process steps. Mark each as Fit (matches your business), Configure (needs SAP config), or Gap (does not fit). Add notes."));
c.push(bp("Conversation — ", "Collaborative discussion threads linked to scope items."));

c.push(h2("3.3 Results"));
c.push(bp("Config Matrix — ", "Review configuration activities. Toggle which to include in your implementation plan."));
c.push(bp("Process Flows — ", "Auto-generated flow diagrams with color-coded status (green=Fit, blue=Configure, red=Gap)."));
c.push(bp("Process Map — ", "Interactive overview of functional areas. Click any area to drill down."));
c.push(bp("Gaps — ", "All identified gaps. Choose a resolution: Extend, Configure, Adapt, or Accept."));
c.push(bp("Action Items — ", "Remaining items that need attention."));

c.push(h2("3.4 Tracking"));
c.push(bp("System Connections — ", "Document integration points between SAP and other systems."));
c.push(bp("Data Transfer — ", "Catalog data objects being migrated: volumes, cleansing, complexity."));
c.push(bp("Change Impact — ", "Assess organizational change impacts per role and area."));
c.push(bp("Workshops — ", "Schedule and manage workshop sessions."));

c.push(h2("3.5 Wrap-up"));
c.push(bp("Activity Log — ", "Timeline of all changes: who did what, when."));
c.push(bp("Report — ", "Generate the assessment report (available after review)."));
c.push(bp("Sign-Off — ", "Formal sign-off process for stakeholders."));

// 4. Navigation
c.push(h1("4. Navigation"));
c.push(tbl(["Location", "What You Will Find"], [
  ["Dashboard", "Your KPIs, active assessments at a glance"],
  ["Assessments", "List of all assessments. Create new ones here."],
  ["Analytics", "Cross-assessment benchmarks and comparisons"],
  ["Organization", "Organization settings, team management, subscription"],
  ["Admin", "Platform administration (admin users only)"],
  ["Settings (user menu)", "Profile, security (passkeys/MFA), notifications"],
]));
c.push(sp());
c.push(h2("Guided Tours"));
c.push(p("Click the Tours button in the top navigation to access interactive walkthroughs. Each tour highlights key UI elements with step-by-step explanations."));

// 5. Roles
c.push(h1("5. User Roles"));
c.push(tbl(["Role", "Access"], [
  ["Platform Admin", "Full access. Manage users, organizations, SAP catalog, all assessments."],
  ["Partner Lead", "Manage assessments across organizations."],
  ["Consultant", "Create and run assessments. Primary workflow role."],
  ["Solution Architect", "Technical review of process steps and configurations."],
  ["Project Manager", "Oversight of progress, workshops, change management."],
  ["Process Owner", "Review and validate process steps for their area."],
  ["IT Lead", "Review integrations, data migration, IT landscape."],
  ["Data Migration Lead", "Manage data transfer planning and execution."],
  ["Executive Sponsor", "High-level review and sign-off."],
  ["Client Admin", "Manage their organization's users and settings."],
  ["Viewer", "Read-only access to assessments."],
]));

// 6. Admin
c.push(h1("6. Admin Functions"));
c.push(p("Platform Admin role required. Go to Admin > Users:"));
c.push(tbl(["Action", "How"], [
  ["Change role", "Click the role dropdown, select new role, confirm"],
  ["Deactivate user", "Click the person icon (orange) — blocks access immediately"],
  ["Reactivate user", "Click the refresh icon (green) on inactive user"],
  ["Reset MFA", "Click the shield icon — clears passkeys and authenticator"],
  ["Delete user", "Click the trash icon — permanent, cannot be undone"],
]));
c.push(note("You cannot modify your own account. The last Platform Admin cannot be deactivated or deleted."));

// 7. Troubleshooting
c.push(h1("7. Troubleshooting"));
c.push(tbl(["Problem", "Solution"], [
  ["Cannot click buttons", "Hard refresh: Ctrl+Shift+R (Win) or Cmd+Shift+R (Mac)"],
  ["Sign-in email not arriving", "Check spam. Ask admin to verify SMTP config."],
  ["Stuck on MFA verification", "Ask Platform Admin to reset MFA (Admin > Users)"],
  ["Page shows error", "Click Try Again. If persists, navigate to Dashboard."],
  ["Passkey button disabled", "Use Chrome, Edge, or Safari (latest version)."],
  ["Cannot proceed past Profile", "Complete at least 60% of profile fields."],
]));

// 8. Quick Ref
c.push(h1("8. Quick Reference"));
c.push(bull("Login URL: https://aptus-sandy.vercel.app/login"));
c.push(bull("Browsers: Chrome, Edge, Safari, Firefox (latest)"));
c.push(bull("Mobile: Fully responsive — works on phones and tablets"));
c.push(bull("Quick search: Cmd+K (Mac) or Ctrl+K (Windows)"));

// Build document
const doc = new Document({
  sections: [{
    properties: { page: { margin: { top: 1440, right: 1200, bottom: 1440, left: 1200 } } },
    children: c,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("ABeam-User-Guide.docx", buffer);
  console.log("Created: ABeam-User-Guide.docx (" + Math.round(buffer.length / 1024) + " KB)");
});
