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

  // Enforce security policy (Whitelist / Invitation Only)
  const policy = canRegister(email);
  if (!policy.allowed) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: policy.reason } },
      { status: 403 },
    );
  }

  // Check if email is already taken
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "An account with this email already exists" } },
      { status: 409 },
    );
  }

  // Check if org slug is taken
  const slug = generateSlug(orgName);
  const existingOrg = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (existingOrg) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "An organization with a similar name already exists" } },
      { status: 409 },
    );
  }

  // Create organization + user in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: orgName,
        slug,
        type: "PARTNER",
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
  const { sent } = await sendMagicLink(email);

  return NextResponse.json(
    {
      data: {
        organizationId: result.org.id,
        userId: result.user.id,
        emailSent: sent,
        message: sent
          ? "Account created. Check your email for a sign-in link."
          : "Account created. Visit the login page to request a sign-in link.",
      },
    },
    { status: 201 },
  );
}
