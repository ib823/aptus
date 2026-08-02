/** POST: Self-service organization signup — creates org, user, starts trial */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { generateSlug } from "@/lib/commercial/plan-engine";
import { createTrial } from "@/lib/commercial/trial-manager";
import { canRegister } from "@/lib/auth/auth-config";
import { sendMagicLink } from "@/lib/auth/send-magic-link";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const signupSchema = z.object({
  orgName: z.string().trim().min(1).max(200),
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().min(1).max(320).email().transform((value) => value.toLowerCase()),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = signupSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const { orgName, fullName, email } = parsed.data;

  // Neutral response returned for EVERY non-malformed signup, whether or not the
  // email already has an account, the org name collides, or the domain policy
  // blocks registration. This prevents account/org enumeration: an
  // unauthenticated caller can no longer tell registered emails apart from
  // unregistered ones by the status code or body. The real outcome (link sent,
  // already-registered, policy-blocked) is only ever visible in the recipient's
  // inbox, never in the HTTP response.
  const neutralResponse = () =>
    NextResponse.json(
      {
        data: {
          message:
            "If those details are eligible, we've sent a sign-in link to that email address.",
        },
      },
      { status: 200 },
    );

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
  const baseSlug = generateSlug(orgName);
  let slug = baseSlug;
  for (let attempt = 2; attempt <= 50; attempt++) {
    const taken = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!taken) break;
    slug = `${baseSlug}-${attempt}`;
  }

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
