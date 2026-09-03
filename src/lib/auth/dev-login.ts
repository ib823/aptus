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

import { isIpAllowed } from "@/lib/auth/test-backdoor-guards";
import { getClientIp } from "@/lib/security/client-ip";

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

/**
 * THE PAGE'S GATES ARE A SUBSET OF THE ENDPOINT'S, AND THAT GAP IS A REAL BUG.
 *
 * `isDevLoginEnabled` above answers three questions. `/api/auth/test-login`
 * asks two more before it ever looks at the secret: a production secret must
 * be at least 24 characters (gate 2.5), and the caller's IP must pass the
 * allow-list (gate 2.6), which FAILS CLOSED in production when neither
 * TEST_LOGIN_ALLOWED_IPS nor ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST is set.
 *
 * So the page rendered a working-looking form and every persona returned a
 * bare `404 Not available`. That happened on the live deployment: three
 * attempts, all `outcome=denied:ip`, and from the browser the only signal was
 * the word "Not available" under a password box — which reads as "you typed
 * the wrong secret". It is not: a wrong secret is a 403 that says so. The
 * request never reached the comparison.
 *
 * This reports the gate that WILL fire, before anyone types anything.
 *
 * WHAT IT MAY SAY, AND WHAT IT MAY NOT. A caller who can load this page
 * already knows the backdoor is enabled and a secret is set — that is what
 * rendering it discloses. Naming which of two remaining gates refuses them
 * adds nothing they could not learn by clicking a persona once. So it never
 * echoes the secret, never echoes the allow-list (those are other people's
 * addresses), and shows the caller only their OWN IP, which they can read off
 * any what-is-my-ip page. The operator gets the fix; an attacker gets a
 * refusal they were getting anyway.
 *
 * ORDER MATCHES THE ROUTE. Reported first-to-fire, so the page names the same
 * gate the endpoint would, rather than a later one the caller cannot reach.
 */
export interface DevLoginBlocker {
  /** Machine-readable, for tests and for the form's own messaging. */
  code: "SECRET_TOO_SHORT" | "IP_ALLOWLIST_FAILS_CLOSED" | "IP_NOT_ON_ALLOWLIST";
  /** One line naming what will happen. */
  title: string;
  /** Why, in the operator's terms. */
  detail: string;
  /** The env change that clears it. Never contains a secret or a stored IP. */
  fix: string;
  /** The caller's own address, when the blocker is about it. */
  callerIp?: string;
}

/**
 * The first endpoint gate that will refuse this caller, or null when the
 * endpoint would proceed to check the secret.
 *
 * Takes `Headers` rather than reading `next/headers` itself: this module is
 * also reached (as a type-only import) from the client form, and it has no
 * business pulling a server-only API into that graph.
 */
export function devLoginBlocker(headers: Headers): DevLoginBlocker | null {
  const isProduction = process.env.NODE_ENV === "production";
  const secret = process.env.E2E_TEST_SECRET;

  // Gate 2.5 — the length is stated because it is already public in
  // .env.example and in the route; the VALUE never appears.
  if (isProduction && secret && secret.length < 24) {
    return {
      code: "SECRET_TOO_SHORT",
      title: "Every sign-in here will be refused: the configured secret is too short.",
      detail:
        "In production the endpoint requires E2E_TEST_SECRET to be at least 24 characters and " +
        "refuses outright when it is shorter, so no value typed below can work. This is a " +
        "deployment setting, not something you can fix from this page.",
      fix: "Set a longer E2E_TEST_SECRET on this deployment and redeploy: node -e \"console.log(require('crypto').randomBytes(24).toString('base64url'))\"",
    };
  }

  // Gate 2.6 — the allow-list itself is never read out; only whether it is
  // configured, which the two fixes differ on.
  if (!isIpAllowed(headers, "TEST_LOGIN_ALLOWED_IPS")) {
    const callerIp = getClientIp(headers);
    const hasAllowList = Boolean(process.env.TEST_LOGIN_ALLOWED_IPS?.trim());

    if (!hasAllowList) {
      return {
        code: "IP_ALLOWLIST_FAILS_CLOSED",
        title: "Every sign-in here will be refused: no IP allow-list is configured.",
        detail:
          "In production the IP gate fails closed, so with no allow-list set the endpoint refuses " +
          "everyone — including you — before it ever compares the secret. That is why a sign-in " +
          "returns \"Not available\" rather than telling you the secret was wrong.",
        fix:
          `Either add this address to TEST_LOGIN_ALLOWED_IPS (${callerIp}), or, if testers' ` +
          "addresses change too often to pin, set ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST=true and " +
          "accept that the secret alone then guards a platform_admin session. Redeploy after either.",
        callerIp,
      };
    }

    return {
      code: "IP_NOT_ON_ALLOWLIST",
      title: "Your sign-in will be refused: this address is not on the allow-list.",
      detail:
        "An allow-list is configured and your address is not in it, so the endpoint refuses the " +
        "request before it compares the secret. Addresses are matched exactly, with no ranges, so " +
        "a new address from the same network still has to be added.",
      fix: `Add ${callerIp} to TEST_LOGIN_ALLOWED_IPS on this deployment and redeploy.`,
      callerIp,
    };
  }

  return null;
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
