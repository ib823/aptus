import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PLANS = [
  {
    name: "Trial",
    price: "Free",
    period: "14 days",
    features: ["1 assessment", "5 team members", "Core assessment features"],
    cta: "Start Free Trial",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Starter",
    price: "$299",
    period: "/month",
    features: [
      "3 assessments",
      "10 team members",
      "Core assessment",
      "Standard reports",
    ],
    cta: "Get Started",
    href: "/signup?plan=STARTER",
    highlighted: false,
  },
  {
    name: "Professional",
    price: "$799",
    period: "/month",
    features: [
      "10 assessments",
      "30 team members",
      "Integration & DM registers",
      "Workshop mode",
      "Analytics dashboard",
      "Standard reports",
    ],
    cta: "Get Started",
    href: "/signup?plan=PROFESSIONAL",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: [
      "Unlimited assessments",
      "Unlimited users",
      "SSO / SCIM",
      "Custom branding",
      "API access",
      "Audit export",
      "Dedicated CSM",
    ],
    cta: "Contact Sales",
    href: "/signup?plan=ENTERPRISE",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-foreground mb-4">
          Plans for every SAP consulting team
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          From single assessments to enterprise-wide deployments. Start with a free trial and upgrade as you grow.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`bg-card border rounded-lg p-6 flex flex-col ${
              plan.highlighted ? "border-primary ring-2 ring-primary relative" : ""
            }`}
          >
            {plan.highlighted && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                Most Popular
              </Badge>
            )}
            <h3 className="text-lg font-semibold mb-2">{plan.name}</h3>
            <div className="mb-4">
              <span className="text-3xl font-bold">{plan.price}</span>
              {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
            </div>
            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5">&#10003;</span>
                  {feature}
                </li>
              ))}
            </ul>
            <Link href={plan.href}>
              <Button
                className="w-full"
                variant={plan.highlighted ? "default" : "outline"}
              >
                {plan.cta}
              </Button>
            </Link>
          </div>
        ))}
      </div>

      <div className="text-center mt-12">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
