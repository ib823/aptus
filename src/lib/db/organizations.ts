/** Organization database service functions */

import { prisma } from "@/lib/db/prisma";
import type { SubscriptionStatus } from "@/types/commercial";

/**
 * Ensure a user has an organization. If no org exists, create one
 * and link the user to it.
 * Returns the organization ID.
 */
export async function ensureOrganization(
  userId: string,
  currentOrgId: string | null,
  companyName: string,
): Promise<string> {
  if (currentOrgId) return currentOrgId;

  const org = await prisma.organization.create({
    data: {
      name: companyName,
      // Set together. `orgType` defaults to "client" so omitting it happened to
      // agree here — but relying on a column default to keep two columns equal
      // is not agreement, it is luck that holds until the default changes.
      type: "client",
      orgType: "client",
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { organizationId: org.id },
  });

  return org.id;
}

/**
 * Fetch the subscription status and trial end date for an organization.
 * Returns default ACTIVE status if no org or no record found.
 */
export async function getOrganizationSubscription(
  organizationId: string,
): Promise<{ status: SubscriptionStatus; trialEndsAt: string | null }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  });

  return {
    status: (org?.subscriptionStatus as SubscriptionStatus) ?? "ACTIVE",
    trialEndsAt: org?.trialEndsAt?.toISOString() ?? null,
  };
}
