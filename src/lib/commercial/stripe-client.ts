/** Stripe client — graceful no-op when STRIPE_SECRET_KEY is not set */

import type Stripe from "stripe";
import type { PlanTier } from "@/types/commercial";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

/** Price IDs mapped from plan tiers — configure via env vars */
const PRICE_IDS: Record<string, string> = {
  STARTER: process.env.STRIPE_PRICE_STARTER ?? "",
  PROFESSIONAL: process.env.STRIPE_PRICE_PROFESSIONAL ?? "",
  ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE ?? "",
};

function isConfigured(): boolean {
  return STRIPE_SECRET_KEY.length > 0;
}

async function getStripe() {
  const { default: Stripe } = await import("stripe");
  return new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion });
}

export async function createCheckoutSession(params: {
  organizationId: string;
  plan: PlanTier;
  billingEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string } | null> {
  if (!isConfigured()) return null;
  const priceId = PRICE_IDS[params.plan];
  if (!priceId) return null;

  const stripe = await getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: params.billingEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      organizationId: params.organizationId,
      plan: params.plan,
    },
  });

  return { url: session.url ?? "" };
}

export async function createCustomerPortalSession(params: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<{ url: string } | null> {
  if (!isConfigured()) return null;

  const stripe = await getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });

  return { url: session.url };
}

export interface StripeWebhookEvent {
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export async function constructWebhookEvent(
  body: string,
  signature: string,
): Promise<StripeWebhookEvent | null> {
  if (!isConfigured() || !STRIPE_WEBHOOK_SECRET) return null;

  const stripe = await getStripe();
  const event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  return event as unknown as StripeWebhookEvent;
}

export function isStripeConfigured(): boolean {
  return isConfigured();
}

export { PRICE_IDS };
