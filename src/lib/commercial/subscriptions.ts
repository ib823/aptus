/**
 * Per-product-line subscriptions — the commercial identity split.
 *
 * The Workbench, the CoreEdge Console and Aptus are priced separately, but
 * `Organization.plan`/`subscriptionStatus` predate that split and every
 * existing gate reads them. So the rule here is COMPATIBILITY BY DERIVATION:
 *
 *   - WORKBENCH resolves from the Organization columns — they ARE the
 *     Workbench subscription, and rewriting every existing reader before a
 *     processor exists would be churn without a decision behind it.
 *   - COREEDGE / APTUS resolve from the Subscription table. No row means NO
 *     subscription — reported as such, never silently inherited from the
 *     Workbench plan: inheriting would make every Workbench customer a
 *     CoreEdge customer by accident, which is a pricing decision nobody took.
 */

import { prisma } from "@/lib/db/prisma";

export const PRODUCT_LINES = ["WORKBENCH", "COREEDGE", "APTUS"] as const;
export type ProductLine = (typeof PRODUCT_LINES)[number];

export interface ResolvedSubscription {
  productLine: ProductLine;
  plan: string;
  status: string;
  endsAt: Date | null;
  /**
   * Where the answer came from: the Organization columns (WORKBENCH), a
   * Subscription row, or nothing — stated so a screen can say "no CoreEdge
   * subscription" instead of rendering an inherited plan as if it were one.
   */
  source: "organization" | "subscription" | "none";
}

export async function getSubscription(
  organizationId: string,
  productLine: ProductLine,
): Promise<ResolvedSubscription> {
  if (productLine === "WORKBENCH") {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true, subscriptionStatus: true, trialEndsAt: true },
    });
    if (!org) return { productLine, plan: "NONE", status: "NONE", endsAt: null, source: "none" };
    return {
      productLine,
      plan: org.plan,
      status: org.subscriptionStatus,
      endsAt: org.trialEndsAt,
      source: "organization",
    };
  }

  const row = await prisma.subscription.findUnique({
    where: { organizationId_productLine: { organizationId, productLine } },
    select: { plan: true, status: true, endsAt: true },
  });
  if (!row) return { productLine, plan: "NONE", status: "NONE", endsAt: null, source: "none" };
  return { productLine, plan: row.plan, status: row.status, endsAt: row.endsAt, source: "subscription" };
}
