/** POST: Create Stripe checkout session */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { createCheckoutSession, isStripeConfigured } from "@/lib/commercial/stripe-client";
import type { PlanTier } from "@/types/commercial";

const VALID_PLANS: PlanTier[] = ["STARTER", "PROFESSIONAL", "ENTERPRISE"];

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
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only organization admins can manage billing" } },
      { status: 403 },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Billing is not configured. Contact support." } },
      { status: 400 },
    );
  }

  const body = await request.json() as { plan?: string };
  const plan = body.plan as PlanTier | undefined;
  if (!plan || !VALID_PLANS.includes(plan)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid plan tier" } },
      { status: 400 },
    );
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: user.organizationId },
    select: { id: true, billingEmail: true },
  });

  const origin = request.headers.get("origin") ?? "";
  const result = await createCheckoutSession({
    organizationId: org.id,
    plan,
    billingEmail: org.billingEmail ?? user.email,
    successUrl: `${origin}/settings/subscription?success=true`,
    cancelUrl: `${origin}/settings/subscription?canceled=true`,
  });

  if (!result) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Could not create checkout session" } },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { url: result.url } });
}
