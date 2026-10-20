/**
 * POST: Self-service signup.
 *
 * Two kinds, told apart by the body:
 *
 *   { orgName, fullName, email }        — the partner trial: creates an
 *                                         organization and a partner_lead, and
 *                                         starts a trial. Unchanged.
 *   { workspace: "developer", email }   — a developer workspace (roadmap
 *                                         P0.13): sends a sign-in link and
 *                                         creates NOTHING. The workspace and its
 *                                         sandbox developer account are created
 *                                         when that link is clicked
 *                                         (lib/auth/developer-workspace.ts), so
 *                                         an address nobody controls never gets
 *                                         a row. Refused unless
 *                                         COREEDGE_DEVELOPER_SIGNUP=open.
 *
 * Both are limited per caller address at the edge (middleware, `signup:`) and
 * per email address here, and both answer the same neutral sentence whatever
 * the outcome, so the response never says whether an address has an account.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { createTrial } from "@/lib/commercial/trial-manager";
import { canRegister } from "@/lib/auth/auth-config";
import {
  checkSignupEmailLimit,
  DEVELOPER_HOME,
  developerSignupMode,
  mayCreateDeveloperWorkspace,
} from "@/lib/auth/developer-workspace";
import { sendMagicLink } from "@/lib/auth/send-magic-link";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { uniqueOrganizationSlug } from "@/lib/org/slug";
import { limiterUnavailableResponse, retryAfterSeconds } from "@/lib/security/rate-limit-response";
import { z } from "zod";

const emailField = z.string().trim().min(1).max(320).email().transform((value) => value.toLowerCase());

const signupSchema = z.object({
  orgName: z.string().trim().min(1).max(200),
  fullName: z.string().trim().min(1).max(200),
  email: emailField,
});

const developerSignupSchema = z.object({
  workspace: z.literal("developer"),
  email: emailField,
});

/** Where a developer's sign-in link lands: through the bridge, onto Discover. */
const DEVELOPER_CALLBACK = `/api/auth/bridge?callbackUrl=${DEVELOPER_HOME}`;

// Neutral response returned for EVERY non-malformed signup, whether or not the
// email already has an account, the org name collides, or the domain policy
// blocks registration. This prevents account/org enumeration: an
// unauthenticated caller can no longer tell registered emails apart from
// unregistered ones by the status code or body. The real outcome (link sent,
// already-registered, policy-blocked) is only ever visible in the recipient's
// inbox, never in the HTTP response.
function neutralResponse(): NextResponse {
  return NextResponse.json(
    {
      data: {
        message:
          "If those details are eligible, we've sent a sign-in link to that email address.",
      },
    },
    { status: 200 },
  );
}

function validationError(message: string): NextResponse {
  return NextResponse.json(
    { error: { code: ERROR_CODES.VALIDATION_ERROR, message } },
    { status: 400 },
  );
}

/**
 * Spend this address's sign-up bucket. A refusal is the same for every
 * address, registered or not, so it reveals nothing the neutral answer hides.
 */
async function refuseIfOverEmailLimit(email: string): Promise<NextResponse | null> {
  const limit = await checkSignupEmailLimit(email);
  if (limit.allowed) return null;
  if (limit.outage) return limiterUnavailableResponse(limit.result);
  return NextResponse.json(
    {
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: "Too many sign-up requests for this email address. Try again later.",
      },
    },
    { status: 429, headers: { "Retry-After": retryAfterSeconds(limit.result) } },
  );
}

async function developerSignup(email: string): Promise<NextResponse> {
  // Not open on this host: said plainly. Whether sign-up is open is not a
  // secret, and a form that silently did nothing would be worse.
  if (developerSignupMode() !== "open") {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: "Developer sign-up is not open on this host. Ask an administrator for an invitation.",
        },
      },
      { status: 404 },
    );
  }

  const overLimit = await refuseIfOverEmailLimit(email);
  if (overLimit) return overLimit;

  // An address the developer policy refuses gets the same answer and no email.
  if (!mayCreateDeveloperWorkspace(email).allowed) return neutralResponse();

  // New or existing, the link is the same: an existing account signs in, and
  // a new address gets its workspace when the link is clicked — not before.
  await sendMagicLink(email, DEVELOPER_CALLBACK);
  return neutralResponse();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) return validationError("Invalid request body");

  const developer = developerSignupSchema.safeParse(bodyResult.data);
  if (developer.success) return developerSignup(developer.data.email);

  const parsed = signupSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Validation failed");
  }

  const { orgName, fullName, email } = parsed.data;

  const overLimit = await refuseIfOverEmailLimit(email);
  if (overLimit) return overLimit;

  // Enforce security policy (Whitelist / Invitation Only). A blocked email gets
  // the same neutral response — no email is sent, but the caller cannot tell.
  const policy = canRegister(email);
  if (!policy.allowed) {
    return neutralResponse();
  }

  // Already registered: send a normal sign-in link (works for existing users)
  // and return the neutral response without creating anything.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    await sendMagicLink(email);
    return neutralResponse();
  }

  // Derive a unique org slug. On collision we suffix rather than 409, so the
  // response never reveals whether an org name is already taken and signup still
  // succeeds.
  const slug = await uniqueOrganizationSlug(orgName);

  // Create organization + user in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: orgName,
        slug,
        // BOTH COLUMNS, THE SAME VALUE, IN THE CANONICAL VOCABULARY.
        // This wrote `type: "PARTNER"` beside `orgType: "partner"` — the same
        // organization spelled two ways on one row, which is how the admin
        // badge (reads `type`) and the settings page (reads `orgType`) came to
        // be able to disagree about what an organization is.
        type: "partner",
        orgType: "partner",
        contactEmail: email,
      },
    });

    const user = await tx.user.create({
      data: {
        email,
        name: fullName,
        role: "partner_lead",
        organizationId: org.id,
      },
    });

    return { org, user };
  });

  // Start trial for the new org
  await createTrial(result.org.id);

  // Send the magic-link email so the user can sign in immediately
  await sendMagicLink(email);

  return neutralResponse();
}
