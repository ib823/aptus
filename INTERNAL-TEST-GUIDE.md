# ABeam Workbench — User Guide (Internal Team)

**Platform:** https://ab-workbench.vercel.app
**Last updated:** 2026-07-08

---

## Getting Started

### Step 1: Sign In — one-click test login (recommended for internal testing)

The fastest way for the internal team to test is the **Dev Login** page. It
skips the email/magic-link round-trip and lets you sign in as any role in one
click. No inbox, no MFA setup.

1. Go to **https://ab-workbench.vercel.app/dev-login**
2. Paste the shared **E2E_TEST_SECRET** into the field
   (get it from the team password manager — it is never emailed or committed)
3. Click the role you want to test as:

   | Role | Use it to test |
   |------|----------------|
   | **Platform Admin** | Admin UI, user management, catalog, cross-org views |
   | **Partner Lead** | Engagement ownership, managing the consultant team |
   | **Consultant** | The day-to-day workshop flow (most common) |
   | **Project Manager** | Deliverable/timeline tracking |
   | **Executive Sponsor** | Executive summary views, sign-off approvals |

You're signed in immediately. To switch roles, return to `/dev-login` and pick
a different card. These test accounts live in an isolated `e2e-test-org` tenant
and are separate from any real production users.

> **Note:** `/dev-login` only exists when the deploy has the test-login env
> flags set (see the deployment checklist at the end of this guide). If the page
> shows "not found", the flags aren't enabled on that deployment — ask the
> deployment owner.

### Step 1 (alternative): Sign In with a magic link

If you'd rather use the production-faithful path with your real work email:

1. Go to https://ab-workbench.vercel.app/login
2. Enter your work email address and click **Continue**
3. Check your inbox for a sign-in email from ABeam
4. Click the **Sign In** link in the email — you'll be logged in automatically

> **Tip:** If the email doesn't arrive within a minute, check your spam folder.

### Step 2: Set Up Two-Factor Authentication (First Time Only — magic-link path)

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

- **Test login (recommended):** https://ab-workbench.vercel.app/dev-login
- **Magic-link login:** https://ab-workbench.vercel.app/login
- **Supported browsers:** Chrome, Edge, Safari, Firefox (latest versions)
- **Mobile:** Responsive design — works on phones and tablets
- **Keyboard shortcut:** `Cmd+K` / `Ctrl+K` for quick search from anywhere

---

## Deployment checklist (for the deployment owner)

For `/dev-login` to work on **ab-workbench.vercel.app**, set these environment
variables on the Vercel project (Production environment):

| Var | Value | Why |
|-----|-------|-----|
| `ENABLE_TEST_LOGIN_ENDPOINT` | `true` | Opens the `/api/auth/test-login` gate that `/dev-login` uses |
| `ALLOW_TEST_LOGIN_IN_PROD` | `true` | Allows the endpoint to run on a production deploy |
| `E2E_TEST_SECRET` | 24+ char random string | The secret testers paste; share via password manager only |
| `INTERNAL_TEST_DEPLOYMENT` | `true` | **Required** — acknowledges this is an internal test deploy so the pre-deploy guard permits the test-login flags (see below). The build fails without it. |
| `TEST_LOGIN_ALLOWED_IPS` | *(optional)* office/VPN IPs, comma-separated | Locks the backdoor to known networks — strongly recommended |

Generate the secret:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### Host routing — make ab-workbench the sole host

Set these so every generated link and redirect points at ab-workbench:

| Var | Value |
|-----|-------|
| `NEXTAUTH_URL` | `https://ab-workbench.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | `https://ab-workbench.vercel.app` |
| `WORKBENCH_HOST` | `ab-workbench.vercel.app` |
| `PORTAL_HOST` | *(leave unset / remove)* — unsetting it turns off the host-split redirects to the old aptus-sandy host |

> **Important — pre-deploy guard:** `scripts/check-production-env.js` treats the
> test-login flags as "dangerous in production" and **fails the build** if they
> are set — *unless* you also set `INTERNAL_TEST_DEPLOYMENT=true` to consciously
> acknowledge this is an internal test deployment. With the acknowledgment the
> build passes with a loud warning and enforces a 24+ char `E2E_TEST_SECRET`.
> This keeps the backdoor impossible to ship by accident: it always takes two
> deliberate signals. Before ab-workbench serves real customers, remove the
> test-login flags, `E2E_TEST_SECRET`, and `INTERNAL_TEST_DEPLOYMENT` so the
> backdoor is gone entirely.

### Security note — dev seed endpoints

`/api/dev/seed-presales-test` and `/api/dev/seed-affirm` are demo helpers that
mint real sessions. They now return **404 in production** unless
`ALLOW_DEV_SEED_IN_PROD=true` is set (flagged dangerous by the pre-deploy
guard). Do **not** set that flag on a shared deploy. The previously hardcoded
demo secrets have been removed.
