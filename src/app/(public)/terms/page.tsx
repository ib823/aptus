import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <p className="text-muted-foreground mb-4">Last updated: March 2026</p>
      <div className="prose prose-slate max-w-none space-y-4">
        <h2 className="text-xl font-semibold mt-8">1. Acceptance of Terms</h2>
        <p>
          By accessing and using the ABeam SAP Best Practices Process Validation Portal
          (&quot;Service&quot;), you agree to be bound by these Terms of Service. If you do not
          agree to these terms, please do not use the Service.
        </p>

        <h2 className="text-xl font-semibold mt-8">2. Description of Service</h2>
        <p>
          ABeam provides a platform for SAP S/4HANA implementation planning, including
          business process assessment, fit-gap analysis, and project readiness evaluation.
        </p>

        <h2 className="text-xl font-semibold mt-8">3. User Accounts</h2>
        <p>
          You are responsible for maintaining the confidentiality of your account credentials
          and for all activities that occur under your account. You agree to notify us
          immediately of any unauthorized use.
        </p>

        <h2 className="text-xl font-semibold mt-8">4. Intellectual Property</h2>
        <p>
          All content, features, and functionality of the Service are owned by ABeam Consulting
          and are protected by international copyright, trademark, and other intellectual
          property laws.
        </p>

        <h2 className="text-xl font-semibold mt-8">5. Data Protection</h2>
        <p>
          Your use of the Service is also governed by our Privacy Policy. Please review our
          Privacy Policy to understand our practices regarding your personal data.
        </p>

        <h2 className="text-xl font-semibold mt-8">6. Limitation of Liability</h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any kind. ABeam shall
          not be liable for any indirect, incidental, special, or consequential damages
          arising from your use of the Service.
        </p>

        <h2 className="text-xl font-semibold mt-8">7. Contact</h2>
        <p>
          For questions about these Terms, please contact your ABeam project team or
          administrator.
        </p>
      </div>
    </div>
  );
}
