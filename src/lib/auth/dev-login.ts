/**
 * Dev-login helpers — UI-side companions to the existing
 * /api/auth/test-login endpoint (src/app/api/auth/test-login/route.ts).
 *
 * The /dev-login page is just a one-click UI on top of the test-login API.
 * We don't add new auth surface; we wrap the existing one.
 *
 * Server-side env gates (must all be true for the page to be reachable):
 *   - ENABLE_TEST_LOGIN_ENDPOINT === "true"
 *   - E2E_TEST_SECRET set
 *   - In production: ALLOW_TEST_LOGIN_IN_PROD === "true"
 *
 * Test users are hardcoded below — the API auto-creates them on first login
 * under the e2e-test-org tenant, so no separate seed step is required.
 */

export function isDevLoginEnabled(): boolean {
  if (process.env.ENABLE_TEST_LOGIN_ENDPOINT !== "true") return false;
  if (!process.env.E2E_TEST_SECRET) return false;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_TEST_LOGIN_IN_PROD !== "true"
  ) {
    return false;
  }
  return true;
}

export interface TestUser {
  email: string;
  name: string;
  role: string;
  description: string;
}

/**
 * Hardcoded test users. Emails must be in @abeam.test or @e2e.test (the
 * domains the test-login API allowlists). The route auto-creates each user
 * on first POST and updates the role on subsequent calls.
 */
export const TEST_USERS: readonly TestUser[] = [
  {
    email: "platform-admin@abeam.test",
    name: "Platform Admin",
    role: "platform_admin",
    description: "Sees everything across all orgs. Use for admin UI testing.",
  },
  {
    email: "partner-lead@abeam.test",
    name: "Partner Lead",
    role: "partner_lead",
    description: "Owns engagements, manages consultant team in the test org.",
  },
  {
    email: "consultant@abeam.test",
    name: "Consultant",
    role: "consultant",
    description: "Day-to-day workshop driver. The most common role to test.",
  },
  {
    email: "consultant-two@abeam.test",
    name: "Consultant (second)",
    role: "consultant",
    // TWO CONSULTANTS, BECAUSE THE DEVELOPER LOOP GENUINELY NEEDS TWO PEOPLE.
    //
    // Segregation of duties is enforced twice, and both gates are correct:
    // `POST /api/studio/clients` refuses to issue a credential to someone who
    // owns the solution, and `evaluateDecision` refuses to let a requester
    // approve their own grant. Only `consultant` can reach either route.
    //
    // With one consultant fixture the two gates were jointly unsatisfiable, so
    // the loop could not be walked end to end without editing the database —
    // which reads as "the product is broken" rather than "the product is
    // governed". This is a FIXTURE gap, not a design one: nothing here weakens
    // either refusal, and the demo is more convincing with them intact.
    description:
      "Second builder. Needed to walk the full loop: one consultant owns the solution and requests access, the other issues the credential and approves the grant.",
  },
  {
    email: "project-manager@abeam.test",
    name: "Project Manager",
    role: "project_manager",
    description: "Tracks deliverables and timelines on engagements.",
  },
  {
    email: "executive-sponsor@abeam.test",
    name: "Executive Sponsor",
    role: "executive_sponsor",
    description: "Approves sign-offs; sees executive summary views only.",
  },
  {
    email: "support@abeam.test",
    name: "Support",
    role: "support",
    description: "CoreEdge operations. Opens the Operations Center only; every other workspace is locked.",
  },
];
