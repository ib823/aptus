import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/stripe/checkout/route";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  createCheckoutSession: vi.fn(),
  isStripeConfigured: vi.fn(),
}));
const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: {
      findUniqueOrThrow: mocks.findUniqueOrThrow,
    },
  },
}));

vi.mock("@/lib/commercial/stripe-client", () => ({
  createCheckoutSession: mocks.createCheckoutSession,
  isStripeConfigured: mocks.isStripeConfigured,
}));

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "billing@example.com",
      role: "partner_lead",
      organizationId: "org-1",
    });
    mocks.isStripeConfigured.mockReturnValue(true);
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "org-1",
      billingEmail: "billing@example.com",
    });
    mocks.createCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.com/session",
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
  });

  it("uses the trusted app origin instead of the request Origin header", async () => {
    const request = new Request("https://malicious.example.net/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "PROFESSIONAL" }),
      headers: {
        "Content-Type": "application/json",
        Origin: "https://malicious.example.net",
      },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith({
      organizationId: "org-1",
      plan: "PROFESSIONAL",
      billingEmail: "billing@example.com",
      successUrl: "https://app.example.com/settings/subscription?success=true",
      cancelUrl: "https://app.example.com/settings/subscription?canceled=true",
    });
  });

  it("returns 400 for malformed JSON", async () => {
    const request = new Request("https://app.example.com/api/stripe/checkout", {
      method: "POST",
      body: "{",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });
});
