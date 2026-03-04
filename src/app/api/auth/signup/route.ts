/** POST: Self-service organization signup — creates org, user, starts trial */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { generateSlug } from "@/lib/commercial/plan-engine";
import { createTrial } from "@/lib/commercial/trial-manager";
import { canRegister } from "@/lib/auth/auth-config";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json() as {
    orgName?: string;
    fullName?: string;
    email?: string;
  };

  if (!body.orgName || !body.fullName || !body.email) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Organization name, full name, and email are required" } },
      { status: 400 },
    );
  }

  const email = body.email.toLowerCase().trim();

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
  const slug = generateSlug(body.orgName);
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
        name: body.orgName!,
        slug,
        type: "PARTNER",
        orgType: "partner",
        billingEmail: email,
        contactEmail: email,
      },
    });

    const user = await tx.user.create({
      data: {
        email,
        name: body.fullName!,
        role: "partner_lead",
        organizationId: org.id,
      },
    });

    return { org, user };
  });

  // Start trial for the new org
  await createTrial(result.org.id);

  return NextResponse.json(
    {
      data: {
        organizationId: result.org.id,
        userId: result.user.id,
        message: "Account created. Sign in with your email to get started.",
      },
    },
    { status: 201 },
  );
}
