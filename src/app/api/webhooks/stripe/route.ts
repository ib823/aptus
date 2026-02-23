/** POST: Stripe webhook handler */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { constructWebhookEvent, isStripeConfigured } from "@/lib/commercial/stripe-client";
import { recordUsageEvent } from "@/lib/commercial/usage-metering";
import type { PlanTier } from "@/types/commercial";
import { PLAN_LIMITS } from "@/types/commercial";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  const event = await constructWebhookEvent(body, signature).catch(() => null);
  if (!event) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const obj = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const orgId = obj.metadata && typeof obj.metadata === "object"
        ? (obj.metadata as Record<string, string>).organizationId
        : undefined;
      const plan = obj.metadata && typeof obj.metadata === "object"
        ? (obj.metadata as Record<string, string>).plan as PlanTier
        : undefined;
      const customerId = typeof obj.customer === "string" ? obj.customer : undefined;
      const subscriptionId = typeof obj.subscription === "string" ? obj.subscription : undefined;

      if (orgId && plan && customerId) {
        // Idempotency: skip if already ACTIVE with same plan
        const org = await prisma.organization.findUnique({
          where: { id: orgId },
          select: { subscriptionStatus: true, plan: true },
        });
        if (org && org.subscriptionStatus === "ACTIVE" && org.plan === plan) break;

        const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.TRIAL;
        const updateData: Record<string, unknown> = {
          plan,
          subscriptionStatus: "ACTIVE",
          stripeCustomerId: customerId,
          maxActiveAssessments: limits.maxActiveAssessments === Infinity ? 999 : limits.maxActiveAssessments,
          maxPartnerUsers: limits.maxPartnerUsers === Infinity ? 999 : limits.maxPartnerUsers,
        };
        if (subscriptionId) updateData.stripeSubscriptionId = subscriptionId;
        await prisma.organization.update({
          where: { id: orgId },
          data: updateData,
        });
        await recordUsageEvent(orgId, "assessment_created", undefined, { action: "subscription_activated", plan });
      }
      break;
    }

    case "customer.subscription.updated": {
      const customerId = typeof obj.customer === "string" ? obj.customer : undefined;
      const status = typeof obj.status === "string" ? obj.status : undefined;

      if (customerId) {
        const org = await prisma.organization.findUnique({
          where: { stripeCustomerId: customerId },
          select: { id: true, subscriptionStatus: true },
        });

        if (org && status) {
          const statusMap: Record<string, string> = {
            active: "ACTIVE",
            past_due: "PAST_DUE",
            canceled: "CANCELED",
            trialing: "TRIALING",
          };
          const mappedStatus = statusMap[status];
          // Idempotency: skip if already in target state
          if (mappedStatus && org.subscriptionStatus !== mappedStatus) {
            await prisma.organization.update({
              where: { id: org.id },
              data: { subscriptionStatus: mappedStatus },
            });
          }
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const customerId = typeof obj.customer === "string" ? obj.customer : undefined;

      if (customerId) {
        const org = await prisma.organization.findUnique({
          where: { stripeCustomerId: customerId },
          select: { id: true, subscriptionStatus: true },
        });

        // Idempotency: skip if already CANCELED
        if (org && org.subscriptionStatus !== "CANCELED") {
          await prisma.organization.update({
            where: { id: org.id },
            data: { subscriptionStatus: "CANCELED" },
          });
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const customerId = typeof obj.customer === "string" ? obj.customer : undefined;

      if (customerId) {
        const org = await prisma.organization.findUnique({
          where: { stripeCustomerId: customerId },
          select: { id: true, subscriptionStatus: true },
        });

        // Idempotency: skip if already PAST_DUE
        if (org && org.subscriptionStatus !== "PAST_DUE") {
          await prisma.organization.update({
            where: { id: org.id },
            data: { subscriptionStatus: "PAST_DUE" },
          });
        }
      }
      break;
    }

    case "invoice.paid": {
      const customerId = typeof obj.customer === "string" ? obj.customer : undefined;

      if (customerId) {
        const org = await prisma.organization.findUnique({
          where: { stripeCustomerId: customerId },
          select: { id: true, subscriptionStatus: true },
        });

        // Idempotency: only transition from PAST_DUE to ACTIVE
        if (org && org.subscriptionStatus === "PAST_DUE") {
          await prisma.organization.update({
            where: { id: org.id },
            data: { subscriptionStatus: "ACTIVE" },
          });
        }
      }
      break;
    }

    default:
      // Unknown event type — acknowledge and ignore
      break;
  }

  return NextResponse.json({ received: true });
}
