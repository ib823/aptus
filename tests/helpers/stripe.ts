/**
 * Stripe mock utilities for testing webhook handling and billing logic.
 */

import { createHmac } from "crypto";

export interface MockStripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
  created: number;
  livemode: boolean;
}

let eventCounter = 0;

/** Create a mock Stripe event */
export function createMockStripeEvent(
  type: string,
  data: Record<string, unknown> = {}
): MockStripeEvent {
  return {
    id: `evt_test_${++eventCounter}`,
    type,
    data: { object: data },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  };
}

/** Create a mock Stripe webhook signature */
export function createWebhookSignature(
  payload: string,
  secret = "whsec_test_secret"
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

/** Create an invalid webhook signature */
export function createInvalidSignature(): string {
  return "t=0,v1=invalid_signature_for_testing";
}

/** Mock Stripe subscription object */
export function createMockSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: `sub_test_${++eventCounter}`,
    customer: "cus_test_001",
    status: "active",
    plan: { id: "plan_professional", amount: 9900, currency: "usd" },
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    cancel_at_period_end: false,
    ...overrides,
  };
}

/** Mock Stripe invoice object */
export function createMockInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: `in_test_${++eventCounter}`,
    customer: "cus_test_001",
    subscription: "sub_test_001",
    status: "paid",
    amount_paid: 9900,
    currency: "usd",
    ...overrides,
  };
}

/** Create a mock meter event */
export function createMockMeterEvent(
  eventName: string,
  value = 1,
  overrides: Record<string, unknown> = {}
) {
  return {
    identifier: `meter_${++eventCounter}`,
    event_name: eventName,
    value,
    timestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

/** Common Stripe webhook event types for testing */
export const STRIPE_EVENTS = {
  SUBSCRIPTION_CREATED: "customer.subscription.created",
  SUBSCRIPTION_UPDATED: "customer.subscription.updated",
  SUBSCRIPTION_DELETED: "customer.subscription.deleted",
  INVOICE_PAID: "invoice.paid",
  INVOICE_PAYMENT_FAILED: "invoice.payment_failed",
  CHECKOUT_COMPLETED: "checkout.session.completed",
} as const;
