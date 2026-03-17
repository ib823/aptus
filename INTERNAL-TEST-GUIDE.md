# ABeam — User Guide (Internal Team)

**Platform:** https://aptus-sandy.vercel.app
**Last updated:** 2026-03-17

---

## Getting Started

### Step 1: Sign In

1. Go to https://aptus-sandy.vercel.app/login
2. Enter your work email address and click **Continue**
3. Check your inbox for a sign-in email from ABeam
4. Click the **Sign In** link in the email — you'll be logged in automatically

> **Tip:** If the email doesn't arrive within a minute, check your spam folder.

### Step 2: Set Up Two-Factor Authentication (First Time Only)

On your first login, you'll be asked to secure your account. Choose one:

**Option A — Passkey (Recommended)**
- Click the **Passkey** card
- Click **Add passkey**
- Use your fingerprint, face scan, or device PIN when prompted
- Done — you're in

**Option B — Authenticator App**
- Click the **Authenticator App** card
- Scan the QR code with Google Authenticator, Microsoft Authenticator, or Authy
- Enter the 6-digit code shown in your app
- Click **Verify & Enable**

### Step 3: Returning Login

After your first setup, future logins are faster:
- **With passkey:** Click **Sign in with passkey** on the login page — one tap and you're in
- **With authenticator:** Sign in via email link, then enter your 6-digit code

---

## Creating Your First Assessment

### Quick Start — ABeam CoreEdge

1. Go to **Assessments** (click "Assessments" in the top navigation)
2. Click the **ABeam CoreEdge** button
3. You'll see the scope items pre-selected for a basic finance assessment:

   | Default (pre-selected) | Description |
   |------------------------|-------------|
   | J58 — Accounting and Financial Close | Month-end/year-end close, journals, reconciliation |
   | J60 — Accounts Payable | Supplier invoices, payment runs, AP reporting |
   | BFA — Basic Bank Account Management | Bank account lifecycle, master data setup |
   | J62 — Asset Accounting | Fixed asset acquisition, depreciation, retirement |

   You can also toggle on these optional add-ons:

   | Optional | Description |
   |----------|-------------|
   | BFB — Basic Cash Operations | Cash position, bank statements, value date |
   | 1EG — Bank Integration with File Interface | Payment file generation, statement import |
   | J54 — Overhead Cost Accounting | Cost center planning, internal allocations |

4. Click items to add/remove them from your assessment
5. Fill in your **Company Name** (required), industry, and country
6. Click **Create Assessment**

### Custom Assessment

If you need a different scope, click **New Assessment** instead. Fill in company details and you'll configure your scope manually in the next step.

---

## Assessment Workflow

Once your assessment is created, you'll work through these stages:

### Setup
- **Profile** — Fill in company details (industry, size, revenue, SAP modules). Reach 60% completion to unlock the next step.
- **Scope** — Select which SAP process areas to include in your assessment. Browse the catalog and check/uncheck items.

### Review
- **Step Review** — For each selected scope item, review the SAP process steps. Mark each as **Fit** (matches your business), **Configure** (needs SAP configuration), or **Gap** (doesn't fit). Add notes to explain your decisions.
- **Conversation** — Collaborative discussion threads linked to scope items.

### Results
- **Config Matrix** — Review configuration activities (mandatory, recommended, optional). Toggle which ones to include in your implementation plan.
- **Process Flows** — View auto-generated process flow diagrams with color-coded status (green = Fit, blue = Configure, red = Gap).
- **Process Map** — Interactive overview of functional areas. Click any area to drill down.
- **Gaps** — All identified gaps in one place. Choose a resolution for each: Extend, Configure, Adapt, or Accept.
- **Action Items** — Remaining items that need attention before the assessment can proceed.

### Tracking
- **System Connections** — Document integration points between SAP and other systems (inbound, outbound, bidirectional).
- **Data Transfer** — Catalog data objects being migrated: volumes, cleansing needs, mapping complexity.
- **Change Impact** — Assess organizational change impacts per role and area. Track severity and training needs.
- **Workshops** — Schedule and manage workshop sessions with attendees and action items.

### Wrap-up
- **Activity Log** — Timeline of all assessment changes: who did what, when.
- **Report** — Generate the assessment report (available after review completion).
- **Sign-Off** — Formal sign-off process for stakeholders.

---

## Navigation

| Location | What you'll find |
|----------|-----------------|
| **Dashboard** | Your KPIs, active assessments at a glance |
| **Assessments** | List of all assessments. Create new ones here. |
| **Analytics** | Cross-assessment benchmarks and comparisons |
| **Organization** | Organization settings, team management, subscription |
| **Admin** | Platform administration (admin users only) |
| **Settings** (user menu) | Your profile, security (passkeys/MFA), notifications |

### Guided Tours

Click the **Tours** button in the top navigation bar to access interactive walkthroughs. Each tour highlights key UI elements with step-by-step explanations. Tours are available for every major page.

---

## User Roles

| Role | Access |
|------|--------|
| **Platform Admin** | Full access. Manage users, organizations, SAP catalog, and all assessments. |
| **Partner Lead** | Manage assessments across organizations. |
| **Consultant** | Create and run assessments. Primary assessment workflow role. |
| **Solution Architect** | Technical review of process steps and configurations. |
| **Project Manager** | Oversight of assessment progress, workshops, and change management. |
| **Process Owner** | Review and validate process steps for their functional area. |
| **IT Lead** | Review integrations, data migration, and IT landscape. |
| **Data Migration Lead** | Manage data transfer planning and execution. |
| **Executive Sponsor** | High-level review and sign-off. |
| **Client Admin** | Manage their organization's users and settings. |
| **Viewer** | Read-only access to assessments. |

---

## Admin Functions

If you have the **Platform Admin** role:

### Managing Users (Admin > Users)

| Action | How |
|--------|-----|
| Change a user's role | Click the role dropdown on their row, select new role, confirm |
| Deactivate a user | Click the person icon (orange) — blocks their access immediately |
| Reactivate a user | Click the refresh icon (green) on an inactive user |
| Reset someone's MFA | Click the shield icon — clears their passkeys and authenticator setup |
| Delete a user | Click the trash icon — permanent, cannot be undone |

> **Safety:** You cannot modify your own account from the admin panel. The last Platform Admin cannot be deactivated or deleted.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't click buttons or links | Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac) |
| Sign-in email not arriving | Check spam folder. Ask admin to verify SMTP is configured. |
| Stuck on MFA verification | Ask a Platform Admin to reset your MFA from Admin > Users |
| Page shows "Something went wrong" | Click **Try Again**. If it persists, go to Dashboard and try again. |
| Passkey button is disabled | Your browser may not support passkeys. Use Chrome, Edge, or Safari. |
| Assessment won't proceed past Profile | Complete at least 60% of the profile fields to unlock Scope Selection. |

---

## Quick Reference

- **Login URL:** https://aptus-sandy.vercel.app/login
- **Supported browsers:** Chrome, Edge, Safari, Firefox (latest versions)
- **Mobile:** Responsive design — works on phones and tablets
- **Keyboard shortcut:** `Cmd+K` / `Ctrl+K` for quick search from anywhere
