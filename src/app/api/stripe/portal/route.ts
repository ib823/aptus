/** POST: Create Stripe customer portal session */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { createCustomerPortalSession, isStripeConfigured } from "@/lib/commercial/stripe-client";
import { getTrustedAppOrigin } from "@/lib/http/app-origin";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (!user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "User must belong to an organization" } },
      { status: 400 },
    );
  }

  if (!["partner_lead", "client_admin", "platform_admin"].includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only organization admins can access billing portal" } },
      { status: 403 },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Billing is not configured" } },
      { status: 400 },
    );
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: user.organizationId },
    select: { stripeCustomerId: true },
  });

  if (!org.stripeCustomerId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "No billing account found. Please subscribe first." } },
      { status: 400 },
    );
  }

  const origin = getTrustedAppOrigin(request);
  const result = await createCustomerPortalSession({
    stripeCustomerId: org.stripeCustomerId,
    returnUrl: `${origin}/settings/subscription`,
  });

  if (!result) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.INTERNAL_ERROR, message: "Could not create portal session" } },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { url: result.url } });
}
