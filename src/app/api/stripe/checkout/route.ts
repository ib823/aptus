/** POST: Create Stripe checkout session */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { createCheckoutSession, isStripeConfigured } from "@/lib/commercial/stripe-client";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { getTrustedAppOrigin } from "@/lib/http/app-origin";
import type { PlanTier } from "@/types/commercial";
import { z } from "zod";

const VALID_PLANS = ["STARTER", "PROFESSIONAL", "ENTERPRISE"] as const satisfies readonly PlanTier[];
const checkoutSchema = z.object({
  plan: z.enum(VALID_PLANS),
});

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

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = checkoutSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Invalid plan tier" } },
      { status: 400 },
    );
  }

  const plan = parsed.data.plan;

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: user.organizationId },
    select: { id: true, billingEmail: true },
  });

  const origin = getTrustedAppOrigin(request);
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
